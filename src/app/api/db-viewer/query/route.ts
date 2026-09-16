import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-server';
import prisma from '@/lib/db/prisma';

// الجداول المسموح بها فقط (whitelist لمنع أي استعلام عشوائي)
const ALLOWED_TABLES = [
  'users', 'stores', 'products', 'inventory', 'customers', 'suppliers',
  'sales_invoices', 'sales_invoice_items', 'purchase_invoices', 'purchase_invoice_items',
  'customer_payments', 'supplier_payments', 'expenses', 'treasuries',
  'treasury_transactions', 'checks', 'stock_transfers', 'product_price_history',
  'inventory_adjustments', 'audit_log',
  'customer_return_invoices', 'customer_return_invoice_items',
  'supplier_return_invoices', 'supplier_return_invoice_items',
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];

// GET /api/db-viewer/query?table=products&page=1&limit=50&search=xxx
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const table = searchParams.get('table') as AllowedTable | null;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));
  const search = searchParams.get('search')?.trim() ?? '';
  const offset = (page - 1) * limit;

  // جلب قائمة الجداول والعدد
  if (!table) {
    const rows = await prisma.$queryRaw<{ table_name: string; row_count: bigint }[]>`
      SELECT
        t.table_name,
        COALESCE(s.n_live_tup, 0) AS row_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = t.table_schema AND s.relname = t.table_name
      WHERE t.table_schema = 'elnesr'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `;
    return NextResponse.json({
      tables: rows.map(r => ({
        name: r.table_name,
        count: Number(r.row_count),
      })),
    });
  }

  // تحقق من الـ whitelist
  if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
    return NextResponse.json({ error: 'جدول غير مسموح' }, { status: 400 });
  }

  try {
    // جلب أسماء الأعمدة
    const cols = await prisma.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'elnesr' AND table_name = ${table}
      ORDER BY ordinal_position
    `;

    if (cols.length === 0) {
      return NextResponse.json({ error: 'جدول غير موجود' }, { status: 404 });
    }

    // بناء استعلام البحث
    // نبحث في أعمدة text/varchar فقط
    const textCols = cols
      .filter(c => ['text', 'character varying', 'uuid', 'integer', 'numeric'].includes(c.data_type))
      .slice(0, 5) // أول 5 أعمدة قابلة للبحث
      .map(c => c.column_name);

    let data: any[];
    let totalCount: { count: bigint }[];

    const schemaTable = `elnesr."${table}"`;

    if (search && textCols.length > 0) {
      const conditions = textCols
        .map(col => `CAST("${col}" AS TEXT) ILIKE '%' || $1 || '%'`)
        .join(' OR ');

      data = await prisma.$queryRawUnsafe(
        `SELECT * FROM ${schemaTable} WHERE ${conditions} ORDER BY 1 DESC LIMIT $2 OFFSET $3`,
        search, limit, offset
      );
      totalCount = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM ${schemaTable} WHERE ${conditions}`,
        search
      );
    } else {
      data = await prisma.$queryRawUnsafe(
        `SELECT * FROM ${schemaTable} ORDER BY 1 DESC LIMIT $1 OFFSET $2`,
        limit, offset
      );
      totalCount = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM ${schemaTable}`
      );
    }

    const total = Number((totalCount[0] as any).count);

    return NextResponse.json({
      columns: cols,
      data: data.map(row => {
        // تحويل BigInt و Decimal إلى string لـ JSON serialization
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'bigint') cleaned[k] = v.toString();
          else if (v instanceof Date) cleaned[k] = v.toISOString();
          else if (v !== null && typeof v === 'object' && 'toFixed' in v) cleaned[k] = v.toString();
          else cleaned[k] = v;
        }
        return cleaned;
      }),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'خطأ في الاستعلام' }, { status: 500 });
  }
}
