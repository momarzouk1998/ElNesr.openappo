import prisma from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { formatEGP, formatDate } from "@/lib/format";
import PrintActions from "@/app/print/invoice/[id]/PrintActions";
import { LOGO_BASE64 } from "@/lib/logo-base64";

export const dynamic = "force-dynamic";

const C = {
  primary: "#0284c7",
  darkPrimary: "#0369a1",
  headerBg: "#002b61",
  text: "#1e293b",
  lightBg: "#f8fafc",
  border: "#cbd5e1",
  success: "#16a34a",
  danger: "#dc2626",
  white: "#ffffff",
  muted: "#64748b",
} as const;

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

  type EventItem = {
    date: Date;
    type: "in" | "out";
    category: string;
    label: string;
    party: string;
    amountIn: number;
    amountOut: number;
    notes?: string | null;
    user?: string | null;
  };

  const allEvents: EventItem[] = [];

  for (const cp of custPayments) {
    allEvents.push({
      date: new Date(cp.payment_date),
      type: "in",
      category: "تحصيل عميل",
      label: `تحصيل من: ${cp.customer?.name || "عميل نقدي"}`,
      party: cp.customer?.name || "عميل نقدي",
      amountIn: Number(cp.amount || 0),
      amountOut: 0,
      notes: cp.notes,
      user: cp.creator?.full_name,
    });
  }

  for (const ca of custAdjustments) {
    const isDebit = ca.type === "debit";
    allEvents.push({
      date: new Date(ca.adjustment_date),
      type: isDebit ? "out" : "in",
      category: isDebit ? "سلفة عميل" : "تسوية عميل",
      label: `${isDebit ? "صرف سلفة" : "تسوية واردة"}: ${ca.customer?.name || ""}`,
      party: ca.customer?.name || "عميل",
      amountIn: !isDebit ? Number(ca.amount || 0) : 0,
      amountOut: isDebit ? Number(ca.amount || 0) : 0,
      notes: ca.notes,
    });
  }

  for (const sp of suppPayments) {
    allEvents.push({
      date: new Date(sp.payment_date),
      type: "out",
      category: "سداد مورد",
      label: `سداد لمورد: ${sp.supplier?.name || ""}`,
      party: sp.supplier?.name || "مورد",
      amountIn: 0,
      amountOut: Number(sp.amount || 0),
      notes: sp.notes,
      user: sp.creator?.full_name,
    });
  }

  for (const sa of suppAdjustments) {
    const isDebit = sa.type === "debit";
    allEvents.push({
      date: new Date(sa.adjustment_date),
      type: isDebit ? "in" : "out",
      category: isDebit ? "استرداد مورد" : "تسوية مورد",
      label: `${isDebit ? "نقدية واردة من مورد" : "تسوية منصرفة لمورد"}: ${sa.supplier?.name || ""}`,
      party: sa.supplier?.name || "مورد",
      amountIn: isDebit ? Number(sa.amount || 0) : 0,
      amountOut: !isDebit ? Number(sa.amount || 0) : 0,
      notes: sa.notes,
    });
  }

  for (const exp of expensesList) {
    allEvents.push({
      date: new Date(exp.expense_date),
      type: "out",
      category: `مصروف: ${exp.category}`,
      label: `مصروفات - ${exp.category}`,
      party: exp.category,
      amountIn: 0,
      amountOut: Number(exp.amount || 0),
      notes: exp.description,
      user: exp.creator?.full_name,
    });
  }

  for (const ea of empAdvances) {
    allEvents.push({
      date: new Date(ea.advance_date),
      type: "out",
      category: "سلفة موظف",
      label: `سلفة موظف: ${ea.employee?.name || ""}`,
      party: ea.employee?.name || "موظف",
      amountIn: 0,
      amountOut: Number(ea.amount || 0),
      notes: ea.notes,
    });
  }

  for (const sal of salaryPayments) {
    allEvents.push({
      date: new Date(sal.payment_date),
      type: "out",
      category: "صرف راتب",
      label: `راتب شهر ${sal.month}/${sal.year} للموظف: ${sal.employee?.name || ""}`,
      party: sal.employee?.name || "موظف",
      amountIn: 0,
      amountOut: Number(sal.net_paid || 0),
      notes: sal.notes,
    });
  }

  for (const pw of partnerWithdrawals) {
    allEvents.push({
      date: new Date(pw.withdrawal_date),
      type: "out",
      category: "مسحوبات شريك",
      label: `مسحوبات شريك: ${pw.partner?.name || ""}`,
      party: pw.partner?.name || "شريك",
      amountIn: 0,
      amountOut: Number(pw.amount || 0),
      notes: pw.notes,
    });
  }

  for (const tx of directTransactions) {
    const isIn = tx.direction === "in" || tx.direction === "transfer_in";
    let category = "حركة نقدية";
    if (tx.reference_type === "direct_deposit" || tx.reference_type === "deposit") category = "إيداع نقدي مباشر";
    else if (tx.reference_type === "direct_withdrawal" || tx.reference_type === "withdrawal") category = "سحب نقدي مباشر";
    else if (tx.reference_type === "treasury_transfer") category = isIn ? "تحويل وارد" : "تحويل صادر";

    allEvents.push({
      date: new Date(tx.transaction_date),
      type: isIn ? "in" : "out",
      category,
      label: tx.notes || (isIn ? "إيداع نقدي" : "سحب نقدي"),
      party: category,
      amountIn: isIn ? Number(tx.amount || 0) : 0,
      amountOut: !isIn ? Number(tx.amount || 0) : 0,
      notes: tx.notes,
      user: tx.by_user?.full_name,
    });
  }

  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = Number(treasury.opening_balance || 0);
  const ledgerEntries: any[] = [];

  if (Number(treasury.opening_balance || 0) !== 0) {
    const op = Number(treasury.opening_balance);
    ledgerEntries.push({
      date: treasury.created_at || new Date("2026-01-01"),
      category: "رصيد افتتاحي",
      label: "الرصيد الافتتاحي للخزينة",
      party: "—",
      amountIn: op > 0 ? op : 0,
      amountOut: op < 0 ? Math.abs(op) : 0,
      balance: running,
      notes: treasury.notes || "بداية تشغيل الخزينة",
      user: "النظام",
    });
  }

  for (const ev of allEvents) {
    running = running + ev.amountIn - ev.amountOut;
    ledgerEntries.push({
      date: ev.date,
      category: ev.category,
      label: ev.label,
      party: ev.party,
      amountIn: ev.amountIn,
      amountOut: ev.amountOut,
      balance: running,
      notes: ev.notes || "—",
      user: ev.user || "—",
    });
  }

  let filtered = [...ledgerEntries];
  if (fromDate) {
    const fTime = new Date(fromDate).getTime();
    filtered = filtered.filter((e) => new Date(e.date).getTime() >= fTime);
  }
  if (toDate) {
    const tTime = new Date(`${toDate}T23:59:59.999Z`).getTime();
    filtered = filtered.filter((e) => new Date(e.date).getTime() <= tTime);
  }

  const periodIn = filtered.reduce((s, e) => s + Number(e.amountIn || 0), 0);
  const periodOut = filtered.reduce((s, e) => s + Number(e.amountOut || 0), 0);

  const printDateStr = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        padding: "12mm 15mm",
        backgroundColor: C.white,
        color: C.text,
        fontFamily: "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
        direction: "rtl",
        fontSize: "12px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <PrintActions />

      {/* Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `3px solid ${C.headerBg}`,
          paddingBottom: "10px",
          marginBottom: "15px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {LOGO_BASE64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={LOGO_BASE64} alt="شعار شركة النسر" style={{ height: "65px", objectFit: "contain" }} />
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: C.headerBg }}>
              شركة النسر للأدوات واللوحات الكهربائية
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: C.muted, fontWeight: "bold" }}>
              كشف حساب حركة الخزينة والمقبوضات والمدفوعات
            </p>
          </div>
        </div>

        <div style={{ textAlign: "left", fontSize: "11px", color: C.muted, lineHeight: "1.5" }}>
          <div><strong>تاريخ الاستخراج:</strong> {printDateStr}</div>
          <div><strong>عدد الحركات:</strong> {filtered.length}</div>
        </div>
      </div>

      {/* Treasury Info & Period Card */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: "12px",
          backgroundColor: C.lightBg,
          border: `1px solid ${C.border}`,
          borderRadius: "10px",
          padding: "12px 16px",
          marginBottom: "15px",
        }}
      >
        <div>
          <div style={{ fontSize: "16px", fontWeight: 900, color: C.headerBg, marginBottom: "4px" }}>
            🏦 {treasury.name} <span style={{ fontSize: "12px", color: C.primary, fontWeight: 700 }}>({treasury.type})</span>
          </div>
          {assignedUserName && (
            <div style={{ fontSize: "11px", color: C.muted }}>
              👤 <strong>المسئول عن الخزينة:</strong> {assignedUserName}
            </div>
          )}
          {treasury.notes && (
            <div style={{ fontSize: "11px", color: C.muted }}>
              📝 <strong>ملاحظات:</strong> {treasury.notes}
            </div>
          )}
        </div>

        <div style={{ textAlign: "left", fontSize: "11px", lineHeight: "1.8" }}>
          <div>
            <strong>فترة التقرير:</strong>{" "}
            <span style={{ color: C.primary, fontWeight: "bold" }}>
              {fromDate || toDate ? `من ${fromDate || "البداية"} إلى ${toDate || "اليوم"}` : "كامل الحركات التاريخية"}
            </span>
          </div>
          <div>
            <strong>الرصيد الفعلي الحالي:</strong>{" "}
            <span style={{ color: C.headerBg, fontSize: "14px", fontWeight: 900, fontFamily: "monospace" }}>
              {formatEGP(Number(treasury.current_balance || 0))} ج.م
            </span>
          </div>
        </div>
      </div>

      {/* Financial Summary Badges */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "10px",
          marginBottom: "15px",
        }}
      >
        <div style={{ border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: C.muted, fontWeight: "bold" }}>الرصيد الافتتاحي</div>
          <div style={{ fontSize: "13px", fontWeight: 900, color: C.text, fontFamily: "monospace", marginTop: "2px" }}>
            {formatEGP(Number(treasury.opening_balance || 0))} ج
          </div>
        </div>

        <div style={{ border: `1px solid #bbf7d0`, backgroundColor: "#f0fdf4", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: C.success, fontWeight: "bold" }}>إجمالي الوارد (+)</div>
          <div style={{ fontSize: "13px", fontWeight: 900, color: C.success, fontFamily: "monospace", marginTop: "2px" }}>
            +{formatEGP(periodIn)} ج
          </div>
        </div>

        <div style={{ border: `1px solid #fecaca`, backgroundColor: "#fef2f2", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: C.danger, fontWeight: "bold" }}>إجمالي المنصرف (-)</div>
          <div style={{ fontSize: "13px", fontWeight: 900, color: C.danger, fontFamily: "monospace", marginTop: "2px" }}>
            -{formatEGP(periodOut)} ج
          </div>
        </div>

        <div style={{ border: `1px solid ${C.primary}`, backgroundColor: "#f0f9ff", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: C.darkPrimary, fontWeight: "bold" }}>الرصيد بعد الفترة</div>
          <div style={{ fontSize: "14px", fontWeight: 900, color: C.headerBg, fontFamily: "monospace", marginTop: "2px" }}>
            {formatEGP(running)} ج
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "10.5px",
          marginBottom: "20px",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: C.headerBg, color: C.white }}>
            <th style={{ padding: "7px 8px", textAlign: "right", border: `1px solid ${C.headerBg}` }}>م</th>
            <th style={{ padding: "7px 8px", textAlign: "right", border: `1px solid ${C.headerBg}` }}>التاريخ</th>
            <th style={{ padding: "7px 8px", textAlign: "right", border: `1px solid ${C.headerBg}` }}>نوع الحركة</th>
            <th style={{ padding: "7px 8px", textAlign: "right", border: `1px solid ${C.headerBg}` }}>البيان والتفاصيل</th>
            <th style={{ padding: "7px 8px", textAlign: "left", border: `1px solid ${C.headerBg}`, color: "#86efac" }}>وارد (+)</th>
            <th style={{ padding: "7px 8px", textAlign: "left", border: `1px solid ${C.headerBg}`, color: "#fca5a5" }}>منصرف (-)</th>
            <th style={{ padding: "7px 8px", textAlign: "left", border: `1px solid ${C.headerBg}` }}>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: "20px", textAlign: "center", color: C.muted, border: `1px solid ${C.border}` }}>
                لا توجد حركات مسجلة بالفترة المحددة
              </td>
            </tr>
          ) : (
            filtered.map((item, index) => (
              <tr
                key={index}
                style={{
                  backgroundColor: index % 2 === 0 ? C.white : C.lightBg,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <td style={{ padding: "6px 8px", textAlign: "right", border: `1px solid ${C.border}`, color: C.muted }}>
                  {index + 1}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", border: `1px solid ${C.border}`, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                  {formatDate(item.date)}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", border: `1px solid ${C.border}`, fontWeight: "bold", whiteSpace: "nowrap" }}>
                  {item.category}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", border: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: "bold", color: C.text }}>{item.label}</div>
                  {item.notes && item.notes !== "—" && (
                    <div style={{ fontSize: "9.5px", color: C.muted }}>{item.notes}</div>
                  )}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "left", border: `1px solid ${C.border}`, fontWeight: "bold", color: C.success, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {item.amountIn > 0 ? `+${formatEGP(item.amountIn)}` : "—"}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "left", border: `1px solid ${C.border}`, fontWeight: "bold", color: C.danger, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {item.amountOut > 0 ? `-${formatEGP(item.amountOut)}` : "—"}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "left", border: `1px solid ${C.border}`, fontWeight: 900, color: C.headerBg, fontFamily: "monospace", whiteSpace: "nowrap", backgroundColor: "rgba(2, 132, 199, 0.04)" }}>
                  {formatEGP(item.balance)} ج
                </td>
              </tr>
            ))
          )}
        </tbody>
        {filtered.length > 0 && (
          <tfoot>
            <tr style={{ backgroundColor: "#f1f5f9", fontWeight: 900, borderTop: `2px solid ${C.headerBg}` }}>
              <td colSpan={4} style={{ padding: "8px", textAlign: "left", border: `1px solid ${C.border}` }}>
                إجمالي الفترة المحددة:
              </td>
              <td style={{ padding: "8px", textAlign: "left", border: `1px solid ${C.border}`, color: C.success, fontFamily: "monospace" }}>
                +{formatEGP(periodIn)} ج
              </td>
              <td style={{ padding: "8px", textAlign: "left", border: `1px solid ${C.border}`, color: C.danger, fontFamily: "monospace" }}>
                -{formatEGP(periodOut)} ج
              </td>
              <td style={{ padding: "8px", textAlign: "left", border: `1px solid ${C.border}`, color: C.headerBg, fontFamily: "monospace" }}>
                {formatEGP(running)} ج
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* Footer Signatures */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "20px",
          marginTop: "30px",
          paddingTop: "15px",
          borderTop: `1px dashed ${C.border}`,
          textAlign: "center",
          fontSize: "11px",
          color: C.text,
        }}
      >
        <div>
          <div style={{ fontWeight: "bold", marginBottom: "40px" }}>أمين الخزينة</div>
          <div style={{ borderTop: `1px dotted ${C.border}`, width: "80%", margin: "0 auto", paddingTop: "5px" }}>
            التوقيع: .....................
          </div>
        </div>

        <div>
          <div style={{ fontWeight: "bold", marginBottom: "40px" }}>المحاسب المسؤول</div>
          <div style={{ borderTop: `1px dotted ${C.border}`, width: "80%", margin: "0 auto", paddingTop: "5px" }}>
            التوقيع: .....................
          </div>
        </div>

        <div>
          <div style={{ fontWeight: "bold", marginBottom: "40px" }}>اعتماد الإدارة</div>
          <div style={{ borderTop: `1px dotted ${C.border}`, width: "80%", margin: "0 auto", paddingTop: "5px" }}>
            الختم / التوقيع: .....................
          </div>
        </div>
      </div>
    </div>
  );
}
