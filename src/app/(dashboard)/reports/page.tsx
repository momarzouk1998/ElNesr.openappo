import { getCurrentUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import prisma from "@/lib/db/prisma";
import { formatEGP } from "@/lib/format";
import { Prisma } from "@prisma/client";
import { canSeeCost } from "@/lib/auth";
import { ReportsDateFilter } from "./ReportsDateFilter";

export const dynamic = 'force-dynamic';

interface SearchParams {
  from?: string;
  to?: string;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentUser();
  if (!profile) redirect('/login');

  const params = await searchParams;
  const fromDate = params.from || '';
  const toDate = params.to || '';

  // بناء شروط التاريخ
  const buildDateWhere = (field: 'payment_date' | 'expense_date' | 'invoice_date' | 'transfer_date' = 'payment_date') => {
    const where: any = {};
    if (fromDate || toDate) {
      where[field] = {};
      if (fromDate) where[field].gte = new Date(fromDate);
      if (toDate) {
        // نهاية اليوم
        const d = new Date(toDate);
        d.setHours(23, 59, 59, 999);
        where[field].lte = d;
      }
    }
    return where;
  };

  // 1. المبيعات في الفترة (المكتملة فقط)
  const salesWhere: Prisma.sales_invoicesWhereInput = {
    status: 'مكتملة',
    ...buildDateWhere('invoice_date'),
  };
  const salesAgg = await prisma.sales_invoices.aggregate({
    where: salesWhere,
    _sum: { total: true, net_profit: true },
    _count: true,
  });
  const totalSales = Number(salesAgg._sum.total || 0);
  const totalProfit = Number(salesAgg._sum.net_profit || 0);
  const salesCount = salesAgg._count;

  // 2. تحصيلات العملاء في الفترة
  const collectionsWhere = buildDateWhere('payment_date');
  const collectionsAgg = await prisma.customer_payments.aggregate({
    where: collectionsWhere,
    _sum: { amount: true },
    _count: true,
  });
  const totalCollections = Number(collectionsAgg._sum.amount || 0);
  const collectionsCount = collectionsAgg._count;

  // 3. مدفوعات الموردين في الفترة
  const supplierPayWhere = buildDateWhere('payment_date');
  const supplierPayAgg = await prisma.supplier_payments.aggregate({
    where: supplierPayWhere,
    _sum: { amount: true },
    _count: true,
  });
  const totalSupplierPayments = Number(supplierPayAgg._sum.amount || 0);
  const supplierPayCount = supplierPayAgg._count;

  // 4. المصروفات في الفترة
  const expensesWhere = buildDateWhere('expense_date');
  const expensesAgg = await prisma.expenses.aggregate({
    where: expensesWhere,
    _sum: { amount: true },
    _count: true,
  });
  const totalExpenses = Number(expensesAgg._sum.amount || 0);
  const expensesCount = expensesAgg._count;

  // 5. المشتريات في الفترة (للمقارنة)
  const purchasesWhere = {
    status: 'مكتملة',
    ...buildDateWhere('purchase_date' as any),
  };
  const purchasesAgg = await prisma.purchase_invoices.aggregate({
    where: purchasesWhere as any,
    _sum: { total_amount: true },
    _count: true,
  });
  const totalPurchases = Number(purchasesAgg._sum.total_amount || 0);

  // 6. أرصدة إجمالية (لا تتأثر بالفلتر الزمني — هي لقطة الآن)
  const [customersDebtAgg, suppliersDebtAgg, pendingSalesAgg, pendingPurchasesAgg] = await Promise.all([
    prisma.customers.aggregate({ where: { is_active: true }, _sum: { balance: true } }),
    prisma.suppliers.aggregate({ where: { is_active: true }, _sum: { balance: true } }),
    prisma.sales_invoices.aggregate({
      where: { status: 'مكتملة', invoice_type: { not: 'عرض سعر' } },
      _sum: { total: true, paid_amount: true },
    }),
    prisma.purchase_invoices.aggregate({
      where: { status: 'مكتملة' },
      _sum: { total_amount: true, paid_amount: true },
    }),
  ]);

  // حسابات صحيحة
  const totalCustomerDebt = Number(customersDebtAgg._sum.balance || 0);
  const totalSupplierDebt = Number(suppliersDebtAgg._sum.balance || 0);
  const pendingSalesAmount = Number(pendingSalesAgg._sum.total || 0) - Number(pendingSalesAgg._sum.paid_amount || 0);
  const pendingPurchasesAmount = Number(pendingPurchasesAgg._sum.total_amount || 0) - Number(pendingPurchasesAgg._sum.paid_amount || 0);

  // صافي التدفق النقدي = التحصيلات - مدفوعات الموردين - المصروفات
  // (المبيعات ممكن نقدية أو آجل، التحصيلات هي اللي دخلت فعلاً)
  const netCashFlow = totalCollections - totalSupplierPayments - totalExpenses;

  // صافي الربح الحقيقي = ربح المبيعات (التكلفة محسوبة بالفعل) - المصروفات
  const realNetProfit = totalProfit - totalExpenses;

  // 7. المصروفات حسب الفئة
  const expensesByCategory = await prisma.expenses.groupBy({
    by: ['category'],
    where: expensesWhere,
    _sum: { amount: true },
    _count: true,
  });
  expensesByCategory.sort((a, b) => Number(b._sum.amount || 0) - Number(a._sum.amount || 0));

  // 8. أفضل العملاء مبيعاً
  const topCustomers = await prisma.sales_invoices.groupBy({
    by: ['customer_id'],
    where: { ...salesWhere, customer_id: { not: null } },
    _sum: { total: true },
    _count: true,
  });
  topCustomers.sort((a, b) => Number(b._sum.total || 0) - Number(a._sum.total || 0));
  const top5 = topCustomers.slice(0, 5);
  const topCustomersData = await Promise.all(
    top5.map(async (c) => {
      const cust = c.customer_id ? await prisma.customers.findUnique({ where: { id: c.customer_id }, select: { name: true, phone: true } }) : null;
      return {
        name: cust?.name || '—',
        phone: cust?.phone,
        total: Number(c._sum.total || 0),
        count: c._count,
      };
    })
  );

  // 9. المخزون (لمن لديه صلاحية)
  const showCost = canSeeCost(profile);
  let inventoryValue = 0;
  let lowStockCount = 0;
  if (showCost) {
    const inv = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(p.last_purchase_price * i.current_stock), 0)::numeric as total
      FROM elnesr.inventory i
      JOIN elnesr.products p ON p.id = i.product_id
      WHERE p.is_active = true AND i.current_stock > 0
    `;
    inventoryValue = Number(inv[0]?.total || 0);
  }
  const lowStock = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count FROM elnesr.inventory
    WHERE current_stock <= reorder_level AND current_stock > 0
  `;
  lowStockCount = Number(lowStock[0]?.count || 0);

  const dateLabel = fromDate || toDate
    ? `من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`
    : 'كل الفترات';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">📈 التقارير</h1>
          <p className="text-sm text-gray-500">ملخص مالي شامل — {dateLabel}</p>
        </div>
        <div className="flex gap-2">
          <a href="/reports/profit-loss" className="btn-primary text-sm">
            📊 تقرير الأرباح والخسائر
          </a>
        </div>
      </div>

      {/* Date filter */}
      <ReportsDateFilter from={fromDate} to={toDate} />

      {/* KPIs الأساسية */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3">📊 المؤشرات المالية ({dateLabel})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon="🛒"
            label="إجمالي المبيعات"
            value={formatEGP(totalSales)}
            subValue={`${salesCount} فاتورة`}
            color="border-blue-300 bg-gradient-to-br from-blue-50 to-white"
            textColor="text-blue-700"
          />
          {showCost && (
            <StatCard
              icon="📈"
              label="صافي ربح المبيعات"
              value={formatEGP(totalProfit)}
              subValue="بعد خصم التكلفة"
              color="border-green-300 bg-gradient-to-br from-green-50 to-white"
              textColor="text-green-700"
            />
          )}
          <StatCard
            icon="💵"
            label="تحصيلات العملاء"
            value={formatEGP(totalCollections)}
            subValue={`${collectionsCount} تحصيل`}
            color="border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"
            textColor="text-emerald-700"
          />
          <StatCard
            icon="💸"
            label="مدفوعات الموردين"
            value={formatEGP(totalSupplierPayments)}
            subValue={`${supplierPayCount} سداد`}
            color="border-red-300 bg-gradient-to-br from-red-50 to-white"
            textColor="text-red-700"
          />
        </div>
      </div>

      {/* KPIs الفرعية */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3">💼 المصروفات والأرصدة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon="📉"
            label="المصروفات"
            value={formatEGP(totalExpenses)}
            subValue={`${expensesCount} مصروف`}
            color="border-orange-300 bg-gradient-to-br from-orange-50 to-white"
            textColor="text-orange-700"
          />
          <StatCard
            icon="🏦"
            label="صافي التدفق النقدي"
            value={formatEGP(netCashFlow)}
            subValue="تحصيلات - مدفوعات - مصروفات"
            color={netCashFlow >= 0 ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white" : "border-red-300 bg-gradient-to-br from-red-50 to-white"}
            textColor={netCashFlow >= 0 ? "text-emerald-700" : "text-red-700"}
          />
          {showCost && (
            <StatCard
              icon="💰"
              label="صافي الربح الحقيقي"
              value={formatEGP(realNetProfit)}
              subValue="ربح المبيعات - المصروفات"
              color={realNetProfit >= 0 ? "border-green-400 bg-gradient-to-br from-green-50 to-white" : "border-red-300 bg-gradient-to-br from-red-50 to-white"}
              textColor={realNetProfit >= 0 ? "text-green-700" : "text-red-700"}
            />
          )}
          <StatCard
            icon="📥"
            label="إجمالي المشتريات"
            value={formatEGP(totalPurchases)}
            subValue="للمقارنة"
            color="border-purple-300 bg-gradient-to-br from-purple-50 to-white"
            textColor="text-purple-700"
          />
        </div>
      </div>

      {/* الأرصدة الإجمالية */}
      <div>
        <h2 className="text-lg font-bold text-slate-700 mb-3">💳 الأرصدة الحالية (لقطة الآن)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            icon="👥"
            label="ديون العملاء"
            value={formatEGP(totalCustomerDebt)}
            subValue="مستحقة لك طرف العملاء"
            color="border-red-300 bg-gradient-to-br from-red-50 to-white"
            textColor="text-red-700"
          />
          <StatCard
            icon="🏭"
            label="ديون الموردين"
            value={formatEGP(totalSupplierDebt)}
            subValue="مستحقة للموردين عليك"
            color="border-yellow-300 bg-gradient-to-br from-yellow-50 to-white"
            textColor="text-yellow-700"
          />
        </div>
      </div>

      {/* تفاصيل: المصروفات + المخزون */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* المصروفات حسب الفئة */}
        <div className="card">
          <h3 className="font-bold text-lg mb-3">📉 المصروفات حسب الفئة</h3>
          {expensesByCategory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">لا توجد مصروفات في هذه الفترة</p>
          ) : (
            <div className="space-y-2">
              {expensesByCategory.map((c) => {
                const amt = Number(c._sum.amount || 0);
                const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                return (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold">{c.category}</span>
                      <span className="font-mono text-gray-600">{formatEGP(amt)} ج <span className="text-xs text-gray-400">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-nazlawy-500 h-full transition-all" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* المخزون */}
        <div className="card">
          <h3 className="font-bold text-lg mb-3">📦 المخزون</h3>
          <div className="space-y-3">
            {showCost && (
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-sm text-gray-700">💰 قيمة المخزون (بآخر سعر شراء)</span>
                <span className="font-bold text-green-700">{formatEGP(inventoryValue)} ج</span>
              </div>
            )}
            <div className={`flex justify-between items-center p-3 rounded-lg ${lowStockCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <span className="text-sm text-gray-700">⚠️ أصناف تحت الحد الأدنى</span>
              <span className={`font-bold ${lowStockCount > 0 ? 'text-red-700' : 'text-gray-700'}`}>{lowStockCount} صنف</span>
            </div>
            {lowStockCount > 0 && (
              <a href="/inventory" className="block text-center btn-primary text-sm">عرض المخزون →</a>
            )}
          </div>
        </div>
      </div>

      {/* أفضل العملاء */}
      {topCustomersData.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-lg mb-3">🏆 أفضل العملاء مبيعاً</h3>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-right">#</th>
                  <th className="p-2 text-right">العميل</th>
                  <th className="p-2 text-right">الهاتف</th>
                  <th className="p-2 text-center">عدد الفواتير</th>
                  <th className="p-2 text-left">إجمالي المبيعات</th>
                </tr>
              </thead>
              <tbody>
                {topCustomersData.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-mono text-gray-500">{i + 1}</td>
                    <td className="p-2 font-semibold">{c.name}</td>
                    <td className="p-2 font-mono text-xs">{c.phone || '—'}</td>
                    <td className="p-2 text-center">{c.count}</td>
                    <td className="p-2 font-bold text-nazlawy-600 text-left">{formatEGP(c.total)} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {salesCount === 0 && collectionsCount === 0 && expensesCount === 0 && (
        <div className="card text-center py-12 text-gray-500">
          <p className="text-4xl mb-2">📭</p>
          <p>لا توجد حركات في هذه الفترة</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, subValue, color, textColor }: {
  icon: string; label: string; value: string; subValue: string;
  color: string; textColor: string;
}) {
  return (
    <div className={`border-r-4 ${color} border rounded-xl p-4 shadow-card hover:shadow-lg transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-gray-600 mb-1">{label}</div>
          <div className={`text-xl md:text-2xl font-extrabold ${textColor}`}>{value}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{subValue}</div>
        </div>
        <div className="text-3xl opacity-80">{icon}</div>
      </div>
    </div>
  );
}
