import prisma from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { formatEGP, formatDate } from "@/lib/format";
import PrintActions from "@/app/print/invoice/[id]/PrintActions";
import { LOGO_BASE64 } from "@/lib/logo-base64";

export const dynamic = "force-dynamic";

export default async function TreasuryStatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from_date?: string; to_date?: string; type?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const fromDate = sp.from_date || "";
  const toDate = sp.to_date || "";
  const typeFilter = sp.type || "all";

  const treasury = await prisma.treasuries.findUnique({
    where: { id },
  });

  if (!treasury || !treasury.is_active) notFound();

  let assignedUserName: string | null = null;
  if (treasury.assigned_user_id) {
    const u = await prisma.users.findUnique({
      where: { id: treasury.assigned_user_id },
      select: { full_name: true },
    });
    assignedUserName = u?.full_name || null;
  }

  // جلب كافة الحركات
  const [
    custPayments,
    custAdjustments,
    suppPayments,
    suppAdjustments,
    expensesList,
    empAdvances,
    salaryPayments,
    partnerWithdrawals,
    directTransactions,
  ] = await Promise.all([
    prisma.customer_payments.findMany({
      where: { treasury_id: id },
      orderBy: { payment_date: "asc" },
      include: { customer: { select: { name: true } }, creator: { select: { full_name: true } } },
    }),
    prisma.customer_adjustments.findMany({
      where: { treasury_id: id },
      orderBy: { adjustment_date: "asc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.supplier_payments.findMany({
      where: { treasury_id: id },
      orderBy: { payment_date: "asc" },
      include: { supplier: { select: { name: true } }, creator: { select: { full_name: true } } },
    }),
    prisma.supplier_adjustments.findMany({
      where: { treasury_id: id },
      orderBy: { adjustment_date: "asc" },
      include: { supplier: { select: { name: true } } },
    }),
    prisma.expenses.findMany({
      where: { treasury_id: id },
      orderBy: { expense_date: "asc" },
      include: { creator: { select: { full_name: true } } },
    }),
    prisma.employee_advances.findMany({
      where: { treasury_id: id },
      orderBy: { advance_date: "asc" },
      include: { employee: { select: { name: true } } },
    }),
    prisma.salary_payments.findMany({
      where: { treasury_id: id },
      orderBy: { payment_date: "asc" },
      include: { employee: { select: { name: true } } },
    }),
    prisma.partner_withdrawals.findMany({
      where: { treasury_id: id },
      orderBy: { withdrawal_date: "asc" },
      include: { partner: { select: { name: true } } },
    }),
    prisma.treasury_transactions.findMany({
      where: {
        treasury_id: id,
        reference_type: { notIn: ["customer_payment", "supplier_payment", "partner_withdrawal", "expense"] },
      },
      orderBy: { transaction_date: "asc" },
      include: { by_user: { select: { full_name: true } } },
    }),
  ]);

  type StatementEvent = {
    id: string;
    date: Date;
    type: "in" | "out";
    category: string;
    label: string;
    amountIn: number;
    amountOut: number;
    notes?: string | null;
    user?: string | null;
  };

  const allEvents: StatementEvent[] = [];

  for (const cp of custPayments) {
    allEvents.push({
      id: "cp-" + cp.id,
      date: new Date(cp.payment_date),
      type: "in",
      category: "تحصيل عميل",
      label: "تحصيل من عميل: " + (cp.customer?.name || "عميل نقدي"),
      amountIn: Number(cp.amount || 0),
      amountOut: 0,
      notes: cp.notes,
      user: cp.creator?.full_name,
    });
  }

  for (const ca of custAdjustments) {
    const isDebit = ca.type === "debit";
    allEvents.push({
      id: "ca-" + ca.id,
      date: new Date(ca.adjustment_date),
      type: isDebit ? "out" : "in",
      category: isDebit ? "سلفة عميل" : "تسوية إضافة عميل",
      label: (isDebit ? "صرف سلفة لعميل" : "توريد تسوية من عميل") + ": " + (ca.customer?.name || ""),
      amountIn: !isDebit ? Number(ca.amount || 0) : 0,
      amountOut: isDebit ? Number(ca.amount || 0) : 0,
      notes: ca.notes,
    });
  }

  for (const sp of suppPayments) {
    allEvents.push({
      id: "sp-" + sp.id,
      date: new Date(sp.payment_date),
      type: "out",
      category: "سداد مورد",
      label: "سداد للمورد: " + (sp.supplier?.name || ""),
      amountIn: 0,
      amountOut: Number(sp.amount || 0),
      notes: sp.notes,
      user: sp.creator?.full_name,
    });
  }

  for (const sa of suppAdjustments) {
    const isDebit = sa.type === "debit";
    allEvents.push({
      id: "sa-" + sa.id,
      date: new Date(sa.adjustment_date),
      type: isDebit ? "in" : "out",
      category: isDebit ? "استرداد من مورد" : "تسوية سداد لمورد",
      label: (isDebit ? "استرداد سلفة من مورد" : "تسوية للمورد بالخصم") + ": " + (sa.supplier?.name || ""),
      amountIn: isDebit ? Number(sa.amount || 0) : 0,
      amountOut: !isDebit ? Number(sa.amount || 0) : 0,
      notes: sa.notes,
    });
  }

  for (const exp of expensesList) {
    allEvents.push({
      id: "exp-" + exp.id,
      date: new Date(exp.expense_date),
      type: "out",
      category: "مصروف: " + exp.category,
      label: "مصروفات - " + exp.category + " (" + exp.description + ")",
      amountIn: 0,
      amountOut: Number(exp.amount || 0),
      notes: exp.notes,
      user: exp.creator?.full_name,
    });
  }

  for (const ea of empAdvances) {
    allEvents.push({
      id: "ea-" + ea.id,
      date: new Date(ea.advance_date),
      type: "out",
      category: "سلفة موظف",
      label: "سلفة موظف: " + (ea.employee?.name || ""),
      amountIn: 0,
      amountOut: Number(ea.amount || 0),
      notes: ea.notes,
    });
  }

  for (const sal of salaryPayments) {
    allEvents.push({
      id: "sal-" + sal.id,
      date: new Date(sal.payment_date),
      type: "out",
      category: "راتب موظف",
      label: "قبض راتب شهر " + sal.month + "/" + sal.year + " للموظف: " + (sal.employee?.name || ""),
      amountIn: 0,
      amountOut: Number(sal.net_paid || 0),
      notes: sal.notes,
    });
  }

  for (const pw of partnerWithdrawals) {
    allEvents.push({
      id: "pw-" + pw.id,
      date: new Date(pw.withdrawal_date),
      type: "out",
      category: "مسحوبات شريك",
      label: "مسحوبات الشريك: " + (pw.partner?.name || ""),
      amountIn: 0,
      amountOut: Number(pw.amount || 0),
      notes: pw.notes,
    });
  }

  for (const tx of directTransactions) {
    const isIn = tx.direction === "in" || tx.direction === "transfer_in";
    let cat = "حركة نقدية";
    if (tx.reference_type === "direct_deposit") cat = "إيداع نقدي مباشر";
    else if (tx.reference_type === "direct_withdrawal") cat = "سحب نقدي مباشر";
    else if (tx.direction === "transfer_in") cat = "تحويل وارد";
    else if (tx.direction === "transfer_out") cat = "تحويل صادر";

    allEvents.push({
      id: "tx-" + tx.id,
      date: new Date(tx.transaction_date),
      type: isIn ? "in" : "out",
      category: cat,
      label: tx.notes || (isIn ? "إيداع نقدية مباشر" : "سحب نقدية مباشر"),
      amountIn: isIn ? Number(tx.amount || 0) : 0,
      amountOut: !isIn ? Number(tx.amount || 0) : 0,
      notes: tx.notes,
      user: tx.by_user?.full_name,
    });
  }

  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = Number(treasury.opening_balance || 0);
  const fullStatement: (StatementEvent & { balance: number })[] = [];

  for (const ev of allEvents) {
    runningBalance = runningBalance + ev.amountIn - ev.amountOut;
    fullStatement.push({
      ...ev,
      balance: runningBalance,
    });
  }

  let filteredItems = [...fullStatement];

  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    filteredItems = filteredItems.filter((i) => i.date >= from);
  }

  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    filteredItems = filteredItems.filter((i) => i.date <= to);
  }

  if (typeFilter === "in") {
    filteredItems = filteredItems.filter((i) => i.type === "in");
  } else if (typeFilter === "out") {
    filteredItems = filteredItems.filter((i) => i.type === "out");
  }

  const periodIn = filteredItems.reduce((s, i) => s + i.amountIn, 0);
  const periodOut = filteredItems.reduce((s, i) => s + i.amountOut, 0);
  const periodNet = periodIn - periodOut;

  const fPeriod = fromDate || toDate ? `من ${fromDate || "البداية"} إلى ${toDate || "الآن"}` : "كامل الفترة";

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-2 sm:px-4 print:p-0 print:bg-white" dir="rtl">
      <PrintActions
        backLink={`/treasury/${id}`}
        backLabel="↩️ عودة لكشف الحساب"
        fileName={`كشف حساب خزينة - ${treasury.name}`}
        title={`كشف حساب خزينة: ${treasury.name}`}
      />

      <div
        id="statement"
        className="max-w-4xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0"
      >
        {/* Header with Logo */}
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-5 mb-6">
          <div className="flex items-center gap-4">
            {LOGO_BASE64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={LOGO_BASE64} alt="شركة النسر" className="w-16 h-16 object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-wide">
                شركة النسر للأدوات واللوحات الكهربائية
              </h1>
              <p className="text-xs text-slate-600 font-bold mt-0.5">
                كشف حساب حركة النقدية والخزائن الرسمية
              </p>
            </div>
          </div>
          <div className="text-left text-xs text-slate-500 font-mono space-y-1">
            <div>تاريخ الاستخراج: {new Date().toLocaleDateString("ar-EG")}</div>
            <div className="font-bold text-slate-800">الفترة: {fPeriod}</div>
          </div>
        </div>

        {/* Treasury Info & Financial Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block mb-0.5">اسم الخزينة والنوع:</span>
            <span className="font-black text-slate-900 text-base">
              {treasury.name} ({treasury.type})
            </span>
            {assignedUserName && (
              <div className="text-xs text-blue-700 font-bold mt-1">👤 المسئول: {assignedUserName}</div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block mb-0.5">الرصيد الافتتاحي:</span>
            <span className="font-black text-slate-900 text-base font-mono">
              {formatEGP(Number(treasury.opening_balance || 0))} ج.م
            </span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-xs text-emerald-800 font-bold block mb-0.5">الرصيد الحالي بالخزينة:</span>
            <span className="font-black text-emerald-700 text-lg font-mono">
              {formatEGP(Number(treasury.current_balance || 0))} ج.م
            </span>
          </div>
        </div>

        {/* Period Summary Bar */}
        <div className="flex items-center justify-between p-3.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold mb-6 flex-wrap gap-2">
          <span>
            🟢 إجمالي الوارد (+): <strong className="text-emerald-700 font-mono">+{formatEGP(periodIn)} ج</strong>
          </span>
          <span>
            🔴 إجمالي المنصرف (-): <strong className="text-rose-700 font-mono">-{formatEGP(periodOut)} ج</strong>
          </span>
          <span>
            ⚖️ صافي الفترة:{" "}
            <strong className={periodNet >= 0 ? "text-emerald-700 font-mono" : "text-rose-700 font-mono"}>
              {periodNet >= 0 ? "+" : ""}
              {formatEGP(periodNet)} ج
            </strong>
          </span>
          <span>
            عدد الحركات: <strong className="font-mono text-slate-900">{filteredItems.length}</strong>
          </span>
        </div>

        {/* Ledger Table */}
        <table className="w-full text-xs text-right border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-800 text-white font-bold text-center">
              <th className="p-2 border border-slate-400 w-8">م</th>
              <th className="p-2 border border-slate-400 whitespace-nowrap">التاريخ</th>
              <th className="p-2 border border-slate-400 whitespace-nowrap">نوع الحركة</th>
              <th className="p-2 border border-slate-400 text-right">البيان والتفاصيل</th>
              <th className="p-2 border border-slate-400 whitespace-nowrap text-emerald-300">وارد (+)</th>
              <th className="p-2 border border-slate-400 whitespace-nowrap text-rose-300">منصرف (-)</th>
              <th className="p-2 border border-slate-400 whitespace-nowrap">الرصيد</th>
              <th className="p-2 border border-slate-400 whitespace-nowrap">المسئول</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-semibold">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-400 font-bold">
                  لا توجد حركات مسجلة خلال هذه الفترة
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => {
                const isIn = item.type === "in";
                return (
                  <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                    <td className="p-2 border border-slate-200 text-center text-slate-500 font-mono">{idx + 1}</td>
                    <td className="p-2 border border-slate-200 font-mono whitespace-nowrap">{formatDate(item.date)}</td>
                    <td className="p-2 border border-slate-200 whitespace-nowrap text-center">
                      <span className={isIn ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                        {item.category}
                      </span>
                    </td>
                    <td className="p-2 border border-slate-200">
                      <div>{item.label}</div>
                      {item.notes && item.notes !== item.label && (
                        <div className="text-[10px] text-slate-500 font-normal">{item.notes}</div>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-emerald-700 text-center whitespace-nowrap">
                      {item.amountIn > 0 ? `+${formatEGP(item.amountIn)}` : "—"}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-rose-700 text-center whitespace-nowrap">
                      {item.amountOut > 0 ? `-${formatEGP(item.amountOut)}` : "—"}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono font-black text-slate-900 text-center whitespace-nowrap bg-slate-100/50">
                      {formatEGP(item.balance)} ج
                    </td>
                    <td className="p-2 border border-slate-200 text-center text-[10px] text-slate-500 whitespace-nowrap">
                      {item.user || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filteredItems.length > 0 && (
            <tfoot>
              <tr className="bg-slate-200 font-black border-t-2 border-slate-400 text-slate-900">
                <td colSpan={4} className="p-2.5 border border-slate-400 text-left">
                  الإجمالي:
                </td>
                <td className="p-2.5 border border-slate-400 text-center font-mono text-emerald-800">
                  +{formatEGP(periodIn)}
                </td>
                <td className="p-2.5 border border-slate-400 text-center font-mono text-rose-800">
                  -{formatEGP(periodOut)}
                </td>
                <td className="p-2.5 border border-slate-400 text-center font-mono text-slate-900">
                  {formatEGP(Number(treasury.current_balance || 0))} ج
                </td>
                <td className="border border-slate-400"></td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Signatures Footer */}
        <div className="grid grid-cols-3 gap-4 pt-12 text-center text-xs font-bold text-slate-700 mt-8 border-t border-slate-200">
          <div>
            <div className="mb-8 text-slate-500">أمين الخزينة / العهدة</div>
            <div className="border-t border-slate-400 w-32 mx-auto pt-1 font-mono">....................</div>
          </div>
          <div>
            <div className="mb-8 text-slate-500">المحاسب المسؤول</div>
            <div className="border-t border-slate-400 w-32 mx-auto pt-1 font-mono">....................</div>
          </div>
          <div>
            <div className="mb-8 text-slate-500">المدير العام / الاعتماد</div>
            <div className="border-t border-slate-400 w-32 mx-auto pt-1 font-mono">....................</div>
          </div>
        </div>
      </div>
    </div>
  );
}
