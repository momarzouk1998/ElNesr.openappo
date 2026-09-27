import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth-server';

export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get('supplier_id') || '';
  const limit = parseInt(searchParams.get('limit') || '50');
  const page = parseInt(searchParams.get('page') || '1');
  const offset = (page - 1) * limit;
  const where = supplierId ? { supplier_id: supplierId } : {};

  const [items, total] = await Promise.all([
    prisma.purchase_invoices.findMany({
      where,
      orderBy: { purchase_number: 'desc' },
      take: limit,
      skip: offset,
      include: {
        supplier: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.purchase_invoices.count({ where }),
  ]);
  return NextResponse.json({ ok: true, data: { items, total, limit, page } });
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  try {
    const body = await request.json();
    const { items, ...purchaseData } = body;

    // === فاليديشن أساسي ===
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'الفاتورة يجب أن تحتوي على صنف واحد على الأقل' } }, { status: 400 });
    }
    for (const it of items) {
      const qty = Number(it.quantity);
      const cost = Number(it.unit_cost);
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'كل صنف يجب أن تكون كميته موجبة' } }, { status: 400 });
      }
      if (!Number.isFinite(cost) || cost < 0) {
        return NextResponse.json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'سعر الشراء غير صالح' } }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const maxN = await tx.purchase_invoices.aggregate({ _max: { purchase_number: true } });
      const purchase_number = (maxN._max.purchase_number || 0) + 1;
      const status = purchaseData.status || 'مكتملة';
      const willBeCompleted = status === 'مكتملة';

      const invoiceDateToUse = purchaseData.purchase_date
        ? new Date(purchaseData.purchase_date)
        : (purchaseData.invoice_date ? new Date(purchaseData.invoice_date) : new Date());

      const invoice = await tx.purchase_invoices.create({
        data: {
          purchase_number,
          purchase_date: invoiceDateToUse,
          supplier_id: purchaseData.supplier_id || null,
          status,
          total_amount: purchaseData.total_amount || 0,
          notes: purchaseData.notes || null,
          created_by: profile.id,
        },
      });
      for (const it of items) {
        const product = await tx.products.findUnique({ where: { id: it.product_id } });
        if (!product) continue;
        await tx.purchase_invoice_items.create({
          data: {
            purchase_id: invoice.id,
            product_id: it.product_id,
            product_name: product.name,
            row_type: 'شراء',
            quantity: it.quantity,
            unit_cost: it.unit_cost,
            line_total: Number(it.quantity) * Number(it.unit_cost),
            store_id: it.store_id,
          },
        });
        // Update product last_purchase_price (track history)
        if (willBeCompleted && Number(it.unit_cost) !== Number(product.last_purchase_price)) {
          await tx.product_price_history.create({
            data: {
              product_id: it.product_id,
              old_price: product.last_purchase_price,
              new_price: it.unit_cost,
              supplier_id: purchaseData.supplier_id,
              purchase_id: invoice.id,
            },
          });
          await tx.products.update({
            where: { id: it.product_id },
            data: {
              last_purchase_price: it.unit_cost,
              last_purchase_date: invoiceDateToUse,
            },
          });
        }
        // Increment inventory
        if (willBeCompleted) {
          await tx.inventory.upsert({
            where: { product_id_store_id: { product_id: it.product_id, store_id: it.store_id } },
            create: { product_id: it.product_id, store_id: it.store_id, current_stock: it.quantity },
            update: { current_stock: { increment: it.quantity } },
          });
        }
      }
      // Update supplier balance
      if (willBeCompleted && purchaseData.supplier_id) {
        await tx.suppliers.update({
          where: { id: purchaseData.supplier_id },
          data: { balance: { increment: purchaseData.total_amount || 0 } },
        });
      }
      return invoice;
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: 'DB_ERROR', message: e?.message } }, { status: 500 });
  }
}
