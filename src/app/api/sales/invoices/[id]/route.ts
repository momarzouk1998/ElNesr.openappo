import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

// GET /api/sales/invoices/[id] - جلب فاتورة بالتفاصيل (خفيف وسريع)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const invoice = await prisma.sales_invoices.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, balance: true } },
        store: { select: { id: true, name: true } },
        creator: { select: { id: true, full_name: true } },
        items: {
          select: {
            id: true,
            product_id: true,
            product_name: true,
            quantity: true,
            unit_price: true,
            line_total: true,
            store_id: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            payment_method: true,
            payment_date: true,
            treasury: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!invoice) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
    return NextResponse.json({ ok: true, data: invoice });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// PATCH /api/sales/invoices/[id] - تعديل الفاتورة
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.sales_invoices.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

    // فقط المنشئ أو admin
    if (existing.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }

    const newStatus = body.status ?? existing.status;
    const isQuotation = (body.invoice_type ?? existing.invoice_type) === 'عرض سعر';
    const wasCompleted = existing.status === 'مكتملة';
    const isCompletedNow = newStatus === 'مكتملة';

    // لو مكتملة - مسموح بتعديل الحالة (إلغاء) والملاحظات والخصم فقط
    if (wasCompleted && (body.items !== undefined || body.invoice_type !== undefined)) {
      return NextResponse.json(
        { ok: false, error: { code: 'FORBIDDEN', message: 'لا يمكن تعديل بنود أو نوع فاتورة مكتملة. ألغِها أولاً.' } },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let snapshotPrevBalance: number | null | undefined = undefined;
      let snapshotNewBalance: number | null | undefined = undefined;

      // 1) تحديث البنود لو الحالة لم تكن مكتملة
      if (!wasCompleted && Array.isArray(body.items)) {
        const newItems = body.items as any[];

        // تحقق أساسي
        for (const it of newItems) {
          const q = Number(it.quantity);
          const p = Number(it.unit_price);
          if (!Number.isFinite(q) || q <= 0) throw new Error('كمية الصنف يجب أن تكون موجبة');
          if (!Number.isFinite(p) || p < 0) throw new Error('سعر الوحدة غير صالح');
        }

        // حذف البنود القديمة
        await tx.sales_invoice_items.deleteMany({ where: { invoice_id: id } });

        // Batch fetch products (تحسين N+1)
        const productIds = newItems.map(it => it.product_id);
        const products = await tx.products.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, last_purchase_price: true },
        });
        const productMap = new Map(products.map(p => [p.id, p]));

        // إضافة البنود الجديدة
        let subtotal = 0;
        const itemsToCreate = [];
        for (const it of newItems) {
          const product = productMap.get(it.product_id);
          if (!product) throw new Error('PRODUCT_NOT_FOUND');
          
          const line_total = Number(it.quantity) * Number(it.unit_price);
          subtotal += line_total;
          
          itemsToCreate.push({
            invoice_id: id,
            product_id: it.product_id,
            product_name: product.name,
            row_type: 'بيع',
            quantity: it.quantity,
            unit_price: it.unit_price,
            line_total,
            unit_cost: Number(product.last_purchase_price),
            line_cost: Number(it.quantity) * Number(product.last_purchase_price),
            store_id: it.store_id || existing.store_id,
          });
        }

        // Batch create items
        await tx.sales_invoice_items.createMany({ data: itemsToCreate });

        // حساب تكلفة البنود وصافي الربح
        const totalCost = itemsToCreate.reduce((s, it) => s + Number(it.line_cost || 0), 0);
        const discount = Number(body.discount ?? existing.discount ?? 0);
        const total = Math.max(0, subtotal - discount);
        const net_profit = total - totalCost;

        // حساب الإجماليات
        await tx.sales_invoices.update({
          where: { id },
          data: { subtotal, discount, total, net_profit },
        });

        // أعد تحميل البنود المحدّثة
        existing.items = await tx.sales_invoice_items.findMany({ where: { invoice_id: id } });
        existing.subtotal = subtotal as any;
        existing.discount = discount as any;
        existing.total = total as any;
        existing.net_profit = net_profit as any;
      } else if (body.discount !== undefined) {
        // تعديل الخصم فقط - إعادة احتساب صافي الربح
        const totalCost = existing.items.reduce((s, it) => s + Number(it.line_cost || 0), 0);
        const discount = Number(body.discount);
        const total = Math.max(0, Number(existing.subtotal) - discount);
        const net_profit = total - totalCost;
        await tx.sales_invoices.update({
          where: { id },
          data: { discount, total, net_profit },
        });
        existing.discount = discount as any;
        existing.total = total as any;
        existing.net_profit = net_profit as any;
      }

      // 2) التعامل مع تغيير الحالة
      let finalPaidAmount = Number(existing.paid_amount || 0);

      if (!wasCompleted && isCompletedNow && !isQuotation) {
        // من مسودة/قيد التنفيذ → مكتملة: تحقق من المخزون وخصمه + تسجيل المدفوعات ورصيد العميل

        // التحقق من المخزون أولاً (قبل أي تعديل)
        for (const it of existing.items) {
          if (!it.store_id) continue;
          const inv = await tx.inventory.findUnique({
            where: { product_id_store_id: { product_id: it.product_id, store_id: it.store_id } },
          });
          const available = inv ? Number(inv.current_stock) : 0;
          if (available < Number(it.quantity)) {
            throw new Error(`المخزون غير كافٍ للصنف "${it.product_name}" (متاح: ${available})`);
          }
        }

        // خصم المخزون
        for (const it of existing.items) {
          if (!it.store_id) continue;

          // Upsert inventory
          const inv = await tx.inventory.upsert({
            where: { product_id_store_id: { product_id: it.product_id, store_id: it.store_id } },
            update: {},
            create: { product_id: it.product_id, store_id: it.store_id, current_stock: 0 },
          });

          // Decrement stock
          await tx.inventory.update({
            where: { id: inv.id },
            data: { current_stock: { decrement: it.quantity } },
          });
        }

        // التعامل مع المدفوعات إن وجدت
        const requestedPaid = body.paid_amount !== undefined ? Math.max(0, parseFloat(body.paid_amount) || 0) : finalPaidAmount;
        if (requestedPaid > 0) {
          finalPaidAmount = requestedPaid;
          let targetTreasuryId = body.treasury_id;
          if (!targetTreasuryId) {
            const firstTreasury = await tx.treasuries.findFirst({
              where: { is_active: true },
              orderBy: { created_at: 'asc' },
            });
            targetTreasuryId = firstTreasury?.id;
          }

          if (targetTreasuryId) {
            await tx.customer_payments.create({
              data: {
                customer_id: existing.customer_id || null,
                invoice_id: id,
                amount: finalPaidAmount,
                payment_method: body.payment_method || 'نقدي',
                treasury_id: targetTreasuryId,
                payment_date: existing.invoice_date,
                notes: `تحصيل نقدي مع إكمال فاتورة مبيعات #${existing.invoice_number}`,
                created_by: profile.id,
              },
            });

            await tx.treasuries.update({
              where: { id: targetTreasuryId },
              data: { current_balance: { increment: finalPaidAmount } },
            });
          }
        }

        // رصيد العميل: balance += (total - paid) — وحفظ الـ snapshot
        if (existing.customer_id) {
          const cust = await tx.customers.findUnique({
            where: { id: existing.customer_id },
            select: { balance: true },
          });
          if (cust) {
            snapshotPrevBalance = Number(cust.balance);
            const balanceDelta = Number(existing.total) - finalPaidAmount;
            snapshotNewBalance = snapshotPrevBalance + balanceDelta;
            if (balanceDelta !== 0) {
              await tx.customers.update({
                where: { id: existing.customer_id },
                data: { balance: { increment: balanceDelta } },
              });
            }
          }
        }
      }

      // 2b) ✅ إصلاح: تعديل paid_amount على فاتورة مكتملة
      //    لما المستخدم يفتح مودال فاتورة مكتملة ويغير المبلغ المدفوع
      if (wasCompleted && isCompletedNow && !isQuotation && body.paid_amount !== undefined) {
        const newPaid = Math.max(0, parseFloat(body.paid_amount) || 0);
        const oldPaid = Number(existing.paid_amount || 0);
        const diff = newPaid - oldPaid;

        if (diff !== 0) {
          if (existing.customer_prev_balance !== null) {
            snapshotNewBalance = Number(existing.customer_prev_balance) + (Number(existing.total) - newPaid);
          }
          // إيجاد آخر سند تحصيل مرتبط بالفاتورة لتعديله (لو واحد بس)
          // أو إنشاء واحد جديد لو فيه أكتر من واحد
          const existingPayments = await tx.customer_payments.findMany({
            where: { invoice_id: id },
            orderBy: { created_at: 'asc' },
          });

          const totalExistingPaid = existingPayments.reduce((s, p) => s + Number(p.amount), 0);

          if (existingPayments.length === 1) {
            // حالة بسيطة: سند واحد بس، نعدّل المبلغ فيه
            const payment = existingPayments[0];
            await tx.customer_payments.update({
              where: { id: payment.id },
              data: {
                amount: newPaid,
                payment_method: body.payment_method || payment.payment_method,
                treasury_id: body.treasury_id || payment.treasury_id,
                notes: `${payment.notes || ''} [مُعدَّل]`,
              },
            });

            // تعديل رصيد الخزينة (لو نفس الخزينة)
            if (payment.treasury_id && !body.treasury_id) {
              await tx.treasuries.update({
                where: { id: payment.treasury_id },
                data: { current_balance: { increment: diff } },
              });
            } else if (body.treasury_id && body.treasury_id !== payment.treasury_id) {
              // نقل بين خزائن
              if (payment.treasury_id) {
                await tx.treasuries.update({
                  where: { id: payment.treasury_id },
                  data: { current_balance: { decrement: oldPaid } },
                });
              }
              await tx.treasuries.update({
                where: { id: body.treasury_id },
                data: { current_balance: { increment: newPaid } },
              });
            }
          } else if (existingPayments.length === 0 && newPaid > 0) {
            // ما كانش فيه سندات أصلاً، ننشئ واحد جديد
            let targetTreasuryId = body.treasury_id;
            if (!targetTreasuryId) {
              const firstTreasury = await tx.treasuries.findFirst({
                where: { is_active: true },
                orderBy: { created_at: 'asc' },
              });
              targetTreasuryId = firstTreasury?.id;
            }
            if (targetTreasuryId) {
              await tx.customer_payments.create({
                data: {
                  customer_id: existing.customer_id || null,
                  invoice_id: id,
                  amount: newPaid,
                  payment_method: body.payment_method || 'نقدي',
                  treasury_id: targetTreasuryId,
                  payment_date: existing.invoice_date,
                  notes: `تحصيل مُضاف لتعديل فاتورة #${existing.invoice_number}`,
                  created_by: profile.id,
                },
              });
              await tx.treasuries.update({
                where: { id: targetTreasuryId },
                data: { current_balance: { increment: newPaid } },
              });
            }
          } else {
            // عدة سندات: نضيف سند بالفرق فقط (آمن للحالات المعقدة)
            if (diff > 0) {
              // دفعة جديدة (زيادة التحصيل)
              let targetTreasuryId = body.treasury_id;
              if (!targetTreasuryId) {
                targetTreasuryId = existingPayments[existingPayments.length - 1].treasury_id;
              }
              if (targetTreasuryId) {
                await tx.customer_payments.create({
                  data: {
                    customer_id: existing.customer_id || null,
                    invoice_id: id,
                    amount: diff,
                    payment_method: body.payment_method || 'نقدي',
                    treasury_id: targetTreasuryId,
                    payment_date: existing.invoice_date,
                    notes: `دفعة إضافية على فاتورة #${existing.invoice_number}`,
                    created_by: profile.id,
                  },
                });
                await tx.treasuries.update({
                  where: { id: targetTreasuryId },
                  data: { current_balance: { increment: diff } },
                });
              }
            } else if (diff < 0) {
              // تخفيض التحصيل: لازم نخصم من الخزينة بدون حذف السندات
              // (الحالة المعقدة — نخصم من آخر سند)
              let remaining = Math.abs(diff);
              for (let i = existingPayments.length - 1; i >= 0 && remaining > 0; i--) {
                const p = existingPayments[i];
                const pAmt = Number(p.amount);
                if (pAmt <= remaining) {
                  await tx.customer_payments.delete({ where: { id: p.id } });
                  if (p.treasury_id) {
                    await tx.treasuries.update({
                      where: { id: p.treasury_id },
                      data: { current_balance: { decrement: pAmt } },
                    });
                  }
                  remaining -= pAmt;
                } else {
                  await tx.customer_payments.update({
                    where: { id: p.id },
                    data: { amount: pAmt - remaining },
                  });
                  if (p.treasury_id) {
                    await tx.treasuries.update({
                      where: { id: p.treasury_id },
                      data: { current_balance: { decrement: remaining } },
                    });
                  }
                  remaining = 0;
                }
              }
            }
          }

          // ✅ تعديل رصيد العميل بالعلاقة العكسية:
          //    زيادة التحصيل = تقليل رصيد العميل (مش زيادة)
          //    نقص التحصيل = زيادة رصيد العميل (مش نقصان)
          if (existing.customer_id) {
            await tx.customers.update({
              where: { id: existing.customer_id },
              data: { balance: { decrement: diff } },
            });
          }

          finalPaidAmount = newPaid;
        }
      }

      // 2c) ✅ ضمان الاتساق: إعادة حساب paid_amount من مجموع customer_payments الفعلي
      if (isCompletedNow && !isQuotation) {
        const allPayments = await tx.customer_payments.aggregate({
          where: { invoice_id: id },
          _sum: { amount: true },
        });
        const sumPaid = Number(allPayments._sum.amount || 0);
        finalPaidAmount = sumPaid > 0 ? sumPaid : finalPaidAmount;
      }

      // 3) تحديث الحالة/النوع/الملاحظات/المدفوع والرصيد الثابت والتاريخ
      const updated = await tx.sales_invoices.update({
        where: { id },
        data: {
          status: newStatus,
          invoice_type: body.invoice_type ?? existing.invoice_type,
          invoice_date: body.invoice_date ? new Date(body.invoice_date) : existing.invoice_date,
          paid_amount: isCompletedNow && !isQuotation ? finalPaidAmount : 0,
          customer_prev_balance: snapshotPrevBalance !== undefined ? snapshotPrevBalance : existing.customer_prev_balance,
          customer_new_balance: snapshotNewBalance !== undefined ? snapshotNewBalance : existing.customer_new_balance,
          notes: body.notes ?? existing.notes,
          updated_at: new Date(),
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    const msg = e?.message || 'حدث خطأ';
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: msg } }, { status: 500 });
  }
}

// DELETE /api/sales/invoices/[id] - إلغاء الفاتورة (إرجاع المخزون وعكس الخزينة) أو حذف نهائي للأدمن
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    // الحذف النهائي للأدمن فقط
    if (permanent) {
      if (profile.role !== 'admin') {
        return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'الحذف النهائي للأدمن فقط' } }, { status: 403 });
      }

      const keepPayments = searchParams.get('keepPayments') === 'true';

      // جلب بيانات الفاتورة مع المدفوعات لمعالجة الخزينة والرصيد
      const invoiceToDelete = await prisma.sales_invoices.findUnique({
        where: { id },
        include: { items: true, payments: true },
      });
      if (!invoiceToDelete) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

      await prisma.$transaction(async (tx) => {
        if (keepPayments) {
          // الإبقاء على المدفوعات كرصيد دائن — فقط فك ارتباطها بالفاتورة
          for (const payment of invoiceToDelete.payments) {
            await tx.customer_payments.update({
              where: { id: payment.id },
              data: { invoice_id: null },
            });
          }
          // عكس دين الفاتورة الكامل من رصيد العميل (الدفع فضل في الخزينة)
          if (invoiceToDelete.customer_id && invoiceToDelete.status === 'مكتملة') {
            const invoiceTotal = Number(invoiceToDelete.total);
            if (invoiceTotal !== 0) {
              await tx.customers.update({
                where: { id: invoiceToDelete.customer_id },
                data: { balance: { decrement: invoiceTotal } },
              });
            }
          }
        } else {
          // حذف المدفوعات وعكس الخزينة ورصيد العميل
          for (const payment of invoiceToDelete.payments) {
            if (payment.treasury_id && Number(payment.amount) > 0) {
              await tx.treasuries.update({
                where: { id: payment.treasury_id },
                data: { current_balance: { decrement: Number(payment.amount) } },
              });
            }
            await tx.customer_payments.delete({ where: { id: payment.id } });
          }
          if (invoiceToDelete.customer_id && invoiceToDelete.status === 'مكتملة') {
            const netDebt = Number(invoiceToDelete.total) - Number(invoiceToDelete.paid_amount || 0);
            if (netDebt !== 0) {
              await tx.customers.update({
                where: { id: invoiceToDelete.customer_id },
                data: { balance: { decrement: netDebt } },
              });
            }
          }
        }

        // حذف البنود والفاتورة نهائياً
        await tx.sales_invoice_items.deleteMany({ where: { invoice_id: id } });
        await tx.sales_invoices.delete({ where: { id } });
      });

      const msg = keepPayments
        ? 'تم حذف الفاتورة نهائياً — المدفوعات أصبحت رصيداً دائناً للعميل'
        : 'تم حذف الفاتورة نهائياً مع جميع المدفوعات';
      return NextResponse.json({ ok: true, data: { message: msg } });
    }


    // الإلغاء العادي (إرجاع المخزون وعكس المدفوعات والخزينة)
    const invoice = await prisma.sales_invoices.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });
    if (!invoice) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

    if (invoice.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }

    if (invoice.status === 'ملغاة') {
      return NextResponse.json({ ok: false, error: { code: 'ALREADY_CANCELLED' } }, { status: 400 });
    }

    const keepPayments = searchParams.get('keepPayments') === 'true';

    await prisma.$transaction(async (tx) => {
      // إرجاع المخزون لو كانت مكتملة
      if (invoice.status === 'مكتملة' && invoice.invoice_type !== 'عرض سعر') {
        for (const it of invoice.items) {
          if (!it.store_id) continue;
          await tx.inventory.upsert({
            where: { product_id_store_id: { product_id: it.product_id, store_id: it.store_id } },
            create: { product_id: it.product_id, store_id: it.store_id, current_stock: Number(it.quantity) },
            update: { current_stock: { increment: it.quantity } },
          });
        }

        if (keepPayments) {
          // إلغاء الفاتورة فقط — المدفوعات تفضل في الخزينة وتصبح رصيد دائن للعميل
          // فك ارتباط السندات بالفاتورة فقط (تفضل كرصيد عام للعميل)
          for (const payment of invoice.payments) {
            await tx.customer_payments.update({
              where: { id: payment.id },
              data: { invoice_id: null },
            });
          }
          // عكس دين الفاتورة كاملاً (total) — لأن الدفع بقي في الخزينة وخُصم من رصيد العميل مسبقاً
          if (invoice.customer_id) {
            const invoiceTotal = Number(invoice.total);
            if (invoiceTotal !== 0) {
              await tx.customers.update({
                where: { id: invoice.customer_id },
                data: { balance: { decrement: invoiceTotal } },
              });
            }
          }
        } else {
          // عكس كل شيء — حذف السندات وخصم الخزينة وإرجاع رصيد العميل
          for (const payment of invoice.payments) {
            if (payment.treasury_id && Number(payment.amount) > 0) {
              await tx.treasuries.update({
                where: { id: payment.treasury_id },
                data: { current_balance: { decrement: Number(payment.amount) } },
              });
            }
            await tx.customer_payments.delete({ where: { id: payment.id } });
          }
          // إرجاع رصيد العميل بالصافي الفعلي (الإجمالي - المدفوع)
          if (invoice.customer_id) {
            const netDebt = Number(invoice.total) - Number(invoice.paid_amount || 0);
            if (netDebt !== 0) {
              await tx.customers.update({
                where: { id: invoice.customer_id },
                data: { balance: { decrement: netDebt } },
              });
            }
          }
        }
      }

      // تعليم الفاتورة كملغاة وتصفير المدفوع
      await tx.sales_invoices.update({
        where: { id },
        data: {
          status: 'ملغاة',
          paid_amount: 0,
          void_reason: 'إلغاء يدوي',
          updated_at: new Date(),
        },
      });
    });

    const msg = keepPayments
      ? 'تم إلغاء الفاتورة وإرجاع المخزون — مبلغ الدفع أصبح رصيدًا دائنًا للعميل'
      : 'تم إلغاء الفاتورة وإرجاع المخزون والمدفوعات';
    return NextResponse.json({ ok: true, data: { message: msg } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
