import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/treasury/[id]/statement — جلب كشف حساب الخزينة الشامل وتتبع الحركات والرصيد اللحظي
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "غير مسجل الدخول" } }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const typeFilter = searchParams.get("type") || "all"; // all | in | out

    const treasury = await prisma.treasuries.findUnique({
      where: { id },
    });

    if (!treasury) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "الخزينة غير موجودة" } }, { status: 404 });
    }

    let assignedUserName: string | null = null;
    if (treasury.assigned_user_id) {
      const u = await prisma.users.findUnique({
        where: { id: treasury.assigned_user_id },
        select: { full_name: true },
      });
      assignedUserName = u?.full_name || null;
    }

    // جلب كافة حركات الخزينة من كافة الجداول
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
      // 1. تحصيلات العملاء (+)
      prisma.customer_payments.findMany({
        where: { treasury_id: id },
        orderBy: { payment_date: "asc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          creator: { select: { id: true, full_name: true } },
        },
      }),
      // 2. تسويات وسلف العملاء (+ / -)
      prisma.customer_adjustments.findMany({
        where: { treasury_id: id },
        orderBy: { adjustment_date: "asc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
      // 3. مدفوعات الموردين (-)
      prisma.supplier_payments.findMany({
        where: { treasury_id: id },
        orderBy: { payment_date: "asc" },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          creator: { select: { id: true, full_name: true } },
        },
      }),
      // 4. تسويات وسلف الموردين (+ / -)
      prisma.supplier_adjustments.findMany({
        where: { treasury_id: id },
        orderBy: { adjustment_date: "asc" },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
        },
      }),
      // 5. المصروفات النقدية (-)
      prisma.expenses.findMany({
        where: { treasury_id: id },
        orderBy: { expense_date: "asc" },
        include: {
          creator: { select: { id: true, full_name: true } },
        },
      }),
      // 6. سلف الموظفين (-)
      prisma.employee_advances.findMany({
        where: { treasury_id: id },
        orderBy: { advance_date: "asc" },
        include: {
          employee: { select: { id: true, name: true } },
        },
      }),
      // 7. رواتب الموظفين (-)
      prisma.salary_payments.findMany({
        where: { treasury_id: id },
        orderBy: { payment_date: "asc" },
        include: {
          employee: { select: { id: true, name: true } },
        },
      }),
      // 8. مسحوبات الشركاء (-)
      prisma.partner_withdrawals.findMany({
        where: { treasury_id: id },
        orderBy: { withdrawal_date: "asc" },
        include: {
          partner: { select: { id: true, name: true } },
        },
      }),
      // 9. الحركات النقدية المباشرة والتحويلات (+ / -)
      prisma.treasury_transactions.findMany({
        where: {
          treasury_id: id,
          reference_type: { notIn: ["customer_payment", "supplier_payment", "partner_withdrawal", "expense"] },
        },
        orderBy: { transaction_date: "asc" },
        include: {
          by_user: { select: { id: true, full_name: true } },
        },
      }),
    ]);

    type StatementEvent = {
      id: string;
      date: Date;
      type: "in" | "out";
      category: string;
      label: string;
      party?: string | null;
      amountIn: number;
      amountOut: number;
      notes?: string | null;
      user?: string | null;
      refId?: string | null;
    };

    const allEvents: StatementEvent[] = [];

    // 1. تحصيلات عملاء
    for (const cp of custPayments) {
      allEvents.push({
        id: `cp-${cp.id}`,
        date: new Date(cp.payment_date),
        type: "in",
        category: "تحصيل عميل",
        label: `تحصيل من عميل: ${cp.customer?.name || "عميل نقدي"}`,
        party: cp.customer?.name,
        amountIn: Number(cp.amount || 0),
        amountOut: 0,
        notes: cp.notes || `طريقة الدفع: ${cp.payment_method || "نقدي"}`,
        user: cp.creator?.full_name,
        refId: cp.id,
      });
    }

    // 2. تسويات عملاء
    for (const ca of custAdjustments) {
      const isDebit = ca.type === "debit";
      allEvents.push({
        id: `ca-${ca.id}`,
        date: new Date(ca.adjustment_date),
        type: isDebit ? "out" : "in",
        category: isDebit ? "سلفة عميل" : "تسوية عميل واردة",
        label: `${isDebit ? "صرف سلفة لعميل" : "تسوية نقدية من عميل"}: ${ca.customer?.name || ""}`,
        party: ca.customer?.name,
        amountIn: !isDebit ? Number(ca.amount || 0) : 0,
        amountOut: isDebit ? Number(ca.amount || 0) : 0,
        notes: ca.notes,
        refId: ca.id,
      });
    }

    // 3. مدفوعات موردين
    for (const sp of suppPayments) {
      allEvents.push({
        id: `sp-${sp.id}`,
        date: new Date(sp.payment_date),
        type: "out",
        category: "سداد مورد",
        label: `سداد لمورد: ${sp.supplier?.name || ""}`,
        party: sp.supplier?.name,
        amountIn: 0,
        amountOut: Number(sp.amount || 0),
        notes: sp.notes || `طريقة السداد: ${sp.payment_method || "نقدي"}`,
        user: sp.creator?.full_name,
        refId: sp.id,
      });
    }

    // 4. تسويات موردين
    for (const sa of suppAdjustments) {
      const isDebit = sa.type === "debit";
      allEvents.push({
        id: `sa-${sa.id}`,
        date: new Date(sa.adjustment_date),
        type: isDebit ? "in" : "out",
        category: isDebit ? "استرداد من مورد" : "تسوية مورد منصرفة",
        label: `${isDebit ? "نقدية واردة من مورد" : "تسوية منصرفة لمورد"}: ${sa.supplier?.name || ""}`,
        party: sa.supplier?.name,
        amountIn: isDebit ? Number(sa.amount || 0) : 0,
        amountOut: !isDebit ? Number(sa.amount || 0) : 0,
        notes: sa.notes,
        refId: sa.id,
      });
    }

    // 5. مصروفات
    for (const exp of expensesList) {
      allEvents.push({
        id: `exp-${exp.id}`,
        date: new Date(exp.expense_date),
        type: "out",
        category: `مصروف: ${exp.category}`,
        label: `مصروفات - ${exp.category} (${exp.description})`,
        party: exp.category,
        amountIn: 0,
        amountOut: Number(exp.amount || 0),
        notes: exp.notes ? `${exp.description} - ${exp.notes}` : exp.description,
        user: exp.creator?.full_name,
        refId: exp.id,
      });
    }

    // 6. سلف موظفين
    for (const ea of empAdvances) {
      allEvents.push({
        id: `ea-${ea.id}`,
        date: new Date(ea.advance_date),
        type: "out",
        category: "سلفة موظف",
        label: `سلفة موظف: ${ea.employee?.name || ""}`,
        party: ea.employee?.name,
        amountIn: 0,
        amountOut: Number(ea.amount || 0),
        notes: ea.notes,
        refId: ea.id,
      });
    }

    // 7. رواتب موظفين
    for (const sal of salaryPayments) {
      allEvents.push({
        id: `sal-${sal.id}`,
        date: new Date(sal.payment_date),
        type: "out",
        category: "صرف راتب",
        label: `صرف راتب شهر ${sal.month}/${sal.year} للموظف: ${sal.employee?.name || ""}`,
        party: sal.employee?.name,
        amountIn: 0,
        amountOut: Number(sal.net_paid || 0),
        notes: sal.notes,
        refId: sal.id,
      });
    }

    // 8. مسحوبات شركاء
    for (const pw of partnerWithdrawals) {
      allEvents.push({
        id: `pw-${pw.id}`,
        date: new Date(pw.withdrawal_date),
        type: "out",
        category: "مسحوبات شريك",
        label: `مسحوبات شريك: ${pw.partner?.name || ""}`,
        party: pw.partner?.name,
        amountIn: 0,
        amountOut: Number(pw.amount || 0),
        notes: pw.notes,
        refId: pw.id,
      });
    }

    // 9. حركات نقدية مباشرة وتحويلات
    for (const tx of directTransactions) {
      const isIn = tx.direction === "in" || tx.direction === "transfer_in";
      let category = "حركة نقدية";
      if (tx.reference_type === "direct_deposit" || tx.reference_type === "deposit") category = "إيداع نقدي مباشر";
      else if (tx.reference_type === "direct_withdrawal" || tx.reference_type === "withdrawal") category = "سحب نقدي مباشر";
      else if (tx.reference_type === "treasury_transfer") category = isIn ? "تحويل وارد من خزينة" : "تحويل صادر لخزينة";

      allEvents.push({
        id: `tx-${tx.id}`,
        date: new Date(tx.transaction_date),
        type: isIn ? "in" : "out",
        category,
        label: tx.notes || (isIn ? "إيداع نقدي" : "سحب نقدي"),
        party: category,
        amountIn: isIn ? Number(tx.amount || 0) : 0,
        amountOut: !isIn ? Number(tx.amount || 0) : 0,
        notes: tx.notes,
        user: tx.by_user?.full_name,
        refId: tx.id,
      });
    }

    allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = Number(treasury.opening_balance || 0);
    const ledgerEntries: any[] = [];

    if (Number(treasury.opening_balance || 0) !== 0) {
      const op = Number(treasury.opening_balance);
      ledgerEntries.push({
        id: "opening-balance",
        date: treasury.created_at ? new Date(treasury.created_at).toISOString() : new Date("2026-01-01").toISOString(),
        type: op >= 0 ? "in" : "out",
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
        id: ev.id,
        date: ev.date.toISOString(),
        type: ev.type,
        category: ev.category,
        label: ev.label,
        party: ev.party || "—",
        amountIn: ev.amountIn,
        amountOut: ev.amountOut,
        balance: running,
        notes: ev.notes || "—",
        user: ev.user || "—",
        refId: ev.refId,
      });
    }

    let filtered = [...ledgerEntries];

    if (fromDate) {
      const from = new Date(fromDate).getTime();
      filtered = filtered.filter((e) => new Date(e.date).getTime() >= from);
    }

    if (toDate) {
      const to = new Date(`${toDate}T23:59:59.999Z`).getTime();
      filtered = filtered.filter((e) => new Date(e.date).getTime() <= to);
    }

    if (typeFilter === "in") {
      filtered = filtered.filter((e) => e.amountIn > 0);
    } else if (typeFilter === "out") {
      filtered = filtered.filter((e) => e.amountOut > 0);
    }

    if (search) {
      filtered = filtered.filter(
        (e) =>
          e.label.toLowerCase().includes(search) ||
          e.category.toLowerCase().includes(search) ||
          (e.party && e.party.toLowerCase().includes(search)) ||
          (e.notes && e.notes.toLowerCase().includes(search)) ||
          (e.user && e.user.toLowerCase().includes(search))
      );
    }

    const periodIn = filtered.reduce((sum, e) => sum + Number(e.amountIn || 0), 0);
    const periodOut = filtered.reduce((sum, e) => sum + Number(e.amountOut || 0), 0);
    const periodNet = periodIn - periodOut;

    const totalAllIn = ledgerEntries.reduce((sum, e) => sum + Number(e.amountIn || 0), 0);
    const totalAllOut = ledgerEntries.reduce((sum, e) => sum + Number(e.amountOut || 0), 0);

    return NextResponse.json({
      ok: true,
      data: {
        treasury: {
          id: treasury.id,
          name: treasury.name,
          type: treasury.type,
          opening_balance: Number(treasury.opening_balance || 0),
          current_balance: Number(treasury.current_balance || 0),
          calculated_balance: running,
          assigned_user: assignedUserName,
          notes: treasury.notes,
        },
        summary: {
          opening_balance: Number(treasury.opening_balance || 0),
          total_in: totalAllIn,
          total_out: totalAllOut,
          current_balance: Number(treasury.current_balance || 0),
          calculated_balance: running,
          period_in: periodIn,
          period_out: periodOut,
          period_net: periodNet,
          movement_count: filtered.length,
          total_count: ledgerEntries.length,
        },
        items: [...filtered].reverse(),
        chronological_items: filtered,
      },
    });
  } catch (e: any) {
    console.error("Error generating treasury statement:", e);
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء جلب كشف الحساب" } }, { status: 500 });
  }
}
