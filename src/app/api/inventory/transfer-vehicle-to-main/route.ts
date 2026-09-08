import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma-direct';

export const dynamic = 'force-dynamic';
export const POST = GET;

export async function GET(req: NextRequest) {
  try {
    // 1. جلب كل المخازن المتاحة
    const stores = await prisma.stores.findMany({
      orderBy: { name: 'asc' }
    });

    // 2. حساب الإحصائيات الدقيقة لكل مخزن مباشرة بروابط المنتجات في الداتابيز الحية
    const rawStats = await prisma.$queryRaw<Array<{
      store_id: string;
      store_name: string;
      total_items: bigint;
      positive_items: bigint;
      total_qty: number;
      total_cost: number;
    }>>`
      SELECT 
        s.id as store_id,
        s.name as store_name,
        COUNT(i.id) as total_items,
        COUNT(CASE WHEN i.current_stock > 0 THEN 1 END) as positive_items,
        COALESCE(SUM(i.current_stock), 0) as total_qty,
        COALESCE(SUM(CASE WHEN i.current_stock > 0 THEN i.current_stock * COALESCE(p.last_purchase_price, 0) ELSE 0 END), 0) as total_cost
      FROM elnesr.stores s
      LEFT JOIN elnesr.inventory i ON i.store_id = s.id
      LEFT JOIN elnesr.products p ON p.id = i.product_id
      GROUP BY s.id, s.name
      ORDER BY s.name ASC;
    `;

    const formattedStats = rawStats.map(r => ({
      store_id: r.store_id,
      store_name: r.store_name,
      total_items: Number(r.total_items),
      positive_items: Number(r.positive_items),
      total_quantity: Number(r.total_qty),
      total_cost_value: Number(r.total_cost)
    }));

    // 3. جلب آخر 10 حركات تحويل مخزني للتأكد والتوثيق
    const recentTransfers = await prisma.stock_transfers.findMany({
      take: 10,
      orderBy: { transfer_date: 'desc' }
    });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      store_statistics_live: formattedStats,
      recent_transfers_log: recentTransfers,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Error' }, { status: 500 });
  }
}
