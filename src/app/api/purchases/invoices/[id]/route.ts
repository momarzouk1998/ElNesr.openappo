import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

// GET /api/purchases/invoices/[id] - جلب تفاصيل فاتورة شراء
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const invoice = await prisma.purchase_invoices.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        creator: { select: { id: true, full_name: true } },
        items: { include: { product: { select: { id: true, name: true, last_purchase_price: true } } } },
        payments: { include: { treasury: { select: { id: true, name: true } } } },
      },
    });
    if (!invoice) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
    return NextResponse.json({ ok: true, data: invoice });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}

// PATCH /api/purchases/invoices/[id] - تعديل الفاتورة
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.purchase_invoices.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

    if (existing.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }

    const newStatus = body.status ?? existing.status;
    const wasCompleted = existing.status === 'مكتملة';
    const isCompletedNow = newStatus === 'مكتملة';

    if (wasCompleted && body.items !== undefined) {
      return NextResponse.json(
        { ok: false, error: { code: 'FORBIDDEN', message: 'لا يمكن تعديل بنود فاتورة مشتريات مكتملة. ألغِها أولاً.' } },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) تحديث البنود لو الحالة لم تكن مكتملة
      if (!wasCompleted && Array.isArray(body.items)) {
        const newItems = body.items as any[];
        for (const it of newItems) {
          const q = Number(it.quantity);
          const p = Number(it.unit_cost);
          if (!Number.isFinite(q) || q <= 0) throw new Error('كمية الصنف يجب أن تكون موجبة');
          if (!Number.isFinite(p) || p < 0) throw new Error('سعر الشراء غير صالح');
        }

        await tx.purchase_invoice_items.deleteMany({ where: { purchase_id: id } });

        let total_amount = 0;
        for (const it of newItems) {
          const product = await tx.products.findUnique({ where: { id: it.product_id } });
          if (!product) throw new Error('PRODUCT_NOT_FOUND');
          const line_total = Number(it.quantity) * Number(it.unit_cost);
          total_amount += line_total;
          await tx.purchase_invoice_items.create({
            data: {
              purchase_id: id,
              product_id: it.product_id,
              product_name: product.name,
              row_type: 'شراء',
              quantity: it.quantity,
              unit_cost: it.unit_cost,
              line_total,
              store_id: it.store_id,
            },
          });
        }

        await tx.purchase_invoices.update({
          where: { id },
          data: { total_amount },
        });

        existing.items = await tx.purchase_invoice_items.findMany({ where: { purchase_id: id } }) as any;
        existing.total_amount = total_amount as any;
      }

      // 2) التعامل مع تغيير الحالة (من قيد التنفيذ إلى مكتملة)
      if (!wasCompleted && isCompletedNow) {
        for (const it of existing.items) {
          if (!it.store_id) continue;
          
          const product = await tx.products.findUnique({ where: { id: it.product_id } });
          if (product && Number(it.unit_cost) !== Number(product.last_purchase_price)) {
            await tx.product_price_history.create({
              data: {
                product_id: it.product_id,
                old_price: product.last_purchase_price,
                new_price: it.unit_cost,
                supplier_id: existing.supplier_id,
                purchase_id: id,
              },
            });
            await tx.products.update({
              where: { id: it.product_id },
              data: {
                last_purchase_price: it.unit_cost,
                last_purchase_date: new Date(),
              },
            });
          }

          await tx.inventory.upsert({
            where: { product_id_store_id: { product_id: it.product_id, store_id: it.store_id } },
            create: { product_id: it.product_id, store_id: it.store_id, current_stock: Number(it.quantity) },
            update: { current_stock: { increment: it.quantity } },
          });
        }

        if (existing.supplier_id) {
          await tx.suppliers.update({
            where: { id: existing.supplier_id },
            data: { balance: { increment: Number(existing.total_amount) } },
          });
        }
      }

      // 3) تحديث الحالة/الملاحظات/التاريخ
      const updated = await tx.purchase_invoices.update({
        where: { id },
        data: {
          status: newStatus,
          purchase_date: body.purchase_date
            ? new Date(body.purchase_date)
            : (body.invoice_date ? new Date(body.invoice_date) : undefined),
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

// DELETE /api/purchases/invoices/[id] - إلغاء الفاتورة (خصم المخزون مرة أخرى)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    const invoice = await prisma.purchase_invoices.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!invoice) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

    if (invoice.created_by !== profile.id && profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }

    // الحذف النهائي - للأدمن فقط
    if (permanent) {
      if (profile.role !== 'admin') {
        return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN', message: 'الحذف النهائي متاح للأدمن فقط' } }, { status: 403 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.purchase_invoice_items.deleteMany({ where: { purchase_id: id } });
        await tx.purchase_invoices.delete({ where: { id } });
      });

      return NextResponse.json({ ok: true, data: { message: 'تم الحذف النهائي للفاتورة' } });
    }

    // الإلغاء العادي
    if (invoice.status === 'ملغاة') {
      return NextResponse.json({ ok: false, error: { code: 'ALREADY_CANCELLED' } }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (invoice.status === 'مكتملة') {
        for (const it of invoice.items) {
          if (!it.store_id) continue;
          
          const inv = await tx.inventory.findUnique({
            where: { product_id_store_id: { product_id: it.product_id, store_id: it.store_id } },
          });
          const available = inv ? Number(inv.current_stock) : 0;
          if (available < Number(it.quantity)) {
            throw new Error(`لا يوجد مخزون كافٍ لإلغاء هذه الفاتورة. الصنف "${it.product_name}" متاح منه ${available} فقط بينما الكمية بالفاتورة ${it.quantity}.`);
          }

          await tx.inventory.update({
            where: { product_id_store_id: { product_id: it.product_id, store_id: it.store_id } },
            data: { current_stock: { decrement: it.quantity } },
          });
        }
      }

      if (invoice.supplier_id && invoice.status === 'مكتملة') {
        await tx.suppliers.update({
          where: { id: invoice.supplier_id },
          data: { balance: { decrement: Number(invoice.total_amount) } },
        });
      }

      await tx.purchase_invoices.update({
        where: { id },
        data: {
          status: 'ملغاة',
          updated_at: new Date(),
        },
      });
    });

    return NextResponse.json({ ok: true, data: { message: 'تم إلغاء الفاتورة' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
