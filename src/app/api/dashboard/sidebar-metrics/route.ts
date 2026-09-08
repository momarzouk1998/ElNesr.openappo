import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [lowStockCount, todaySalesCount] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint as count FROM elnesr.inventory
        WHERE current_stock <= reorder_level AND current_stock > 0
      `.then(r => Number(r[0]?.count || 0)),
      prisma.sales_invoices.count({
        where: { invoice_date: { gte: today }, status: 'مكتملة' },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        lowStock: lowStockCount,
        todaySales: todaySalesCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: e?.message || 'حدث خطأ' } },
      { status: 500 }
    );
  }
}
