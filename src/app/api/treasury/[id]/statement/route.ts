import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/treasury/[id]/statement — كشف حساب تفصيلي للخزينة مع كافة الحركات والرصيد التراكمي
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

    // جلب كافة حركات الخزينة من جميع الجداول المرتبطة
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

    // 1. تحصيلات عملاء (+)
    for (const cp of custPayments) {
      allEvents.push({
        id: "cp-" + cp.id,
        date: new Date(cp.payment_date),
        type: "in",
        category: "تحصيل عميل",
        label: "تحصيل من عميل: " + (cp.customer?.name || "عميل نقدي"),
        party: cp.customer?.name,
        amountIn: Number(cp.amount || 0),
        amountOut: 0,
        notes: cp.notes || ("طريقة الدفع: " + (cp.payment_method || "نقدي")),
        user: cp.creator?.full_name,
        refId: cp.id,
      });
    }

    // 2. تسويات وسلف عملاء
    for (const ca of custAdjustments) {
      const isDebit = ca.type === "debit"; // سلفة للعميل (خروج من الخزينة)
      allEvents.push({
        id: "ca-" + ca.id,
        date: new Date(ca.adjustment_date),
        type: isDebit ? "out" : "in",
        category: isDebit ? "سلفة عميل" : "تسوية إضافة عميل",
        label: (isDebit ? "صرف سلفة لعميل" : "توريد تسوية من عميل") + ": " + (ca.customer?.name || ""),
        party: ca.customer?.name,
        amountIn: !isDebit ? Number(ca.amount || 0) : 0,
        amountOut: isDebit ? Number(ca.amount || 0) : 0,
        notes: ca.notes,
        refId: ca.id,
      });
    }

    // 3. مدفوعات موردين (-)
    for (const sp of suppPayments) {
      allEvents.push({
        id: "sp-" + sp.id,
        date: new Date(sp.payment_date),
        type: "out",
        category: "سداد مورد",
        label: "سداد للمورد: " + (sp.supplier?.name || ""),
        party: sp.supplier?.name,
        amountIn: 0,
        amountOut: Number(sp.amount || 0),
        notes: sp.notes || ("طريقة السداد: " + (sp.payment_method || "نقدي")),
        user: sp.creator?.full_name,
        refId: sp.id,
      });
    }

    // 4. تسويات وسلف موردين
    for (const sa of suppAdjustments) {
      const isDebit = sa.type === "debit"; // سلفة مستردة من مورد (دخول للخزينة)
      allEvents.push({
        id: "sa-" + sa.id,
        date: new Date(sa.adjustment_date),
        type: isDebit ? "in" : "out",
        category: isDebit ? "استرداد من مورد" : "تسوية سداد لمورد",
        label: (isDebit ? "استرداد سلفة من مورد" : "تسوية للمورد بالخصم") + ": " + (sa.supplier?.name || ""),
        party: sa.supplier?.name,
        amountIn: isDebit ? Number(sa.amount || 0) : 0,
        amountOut: !isDebit ? Number(sa.amount || 0) : 0,
        notes: sa.notes,
        refId: sa.id,
      });
    }

    // 5. المصروفات (-)
    for (const exp of expensesList) {
      allEvents.push({
        id: "exp-" + exp.id,
        date: new Date(exp.expense_date),
        type: "out",
        category: "مصروف: " + exp.category,
        label: "مصروفات - " + exp.category + " (" + exp.description + ")",
        party: exp.category,
        amountIn: 0,
        amountOut: Number(exp.amount || 0),
        notes: exp.notes ? (exp.description + " - " + exp.notes) : exp.description,
        user: exp.creator?.full_name,
        refId: exp.id,
      });
    }

    // 6. سلف الموظفين (-)
    for (const ea of empAdvances) {
      allEvents.push({
        id: "ea-" + ea.id,
        date: new Date(ea.advance_date),
        type: "out",
        category: "سلفة موظف",
        label: "سلفة موظف: " + (ea.employee?.name || ""),
        party: ea.employee?.name,
        amountIn: 0,
        amountOut: Number(ea.amount || 0),
        notes: ea.notes,
        refId: ea.id,
      });
    }

    // 7. رواتب الموظفين (-)
    for (const sal of salaryPayments) {
      allEvents.push({
        id: "sal-" + sal.id,
        date: new Date(sal.payment_date),
        type: "out",
        category: "راتب موظف",
        label: "قبض راتب شهر " + sal.month + "/" + sal.year + " للموظف: " + (sal.employee?.name || ""),
        party: sal.employee?.name,
        amountIn: 0,
        amountOut: Number(sal.net_paid || 0),
        notes: sal.notes,
        refId: sal.id,
      });
    }

    // 8. مسحوبات الشركاء (-)
    for (const pw of partnerWithdrawals) {
      allEvents.push({
        id: "pw-" + pw.id,
        date: new Date(pw.withdrawal_date),
        type: "out",
        category: "مسحوبات شريك",
        label: "مسحوبات الشريك: " + (pw.partner?.name || ""),
        party: pw.partner?.name,
        amountIn: 0,
        amountOut: Number(pw.amount || 0),
        notes: pw.notes,
        refId: pw.id,
      });
    }

    // 9. حركات الخزينة المباشرة والتحويلات (+ / -)
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
        party: tx.reference_type || cat,
        amountIn: isIn ? Number(tx.amount || 0) : 0,
        amountOut: !isIn ? Number(tx.amount || 0) : 0,
        notes: tx.notes,
        user: tx.by_user?.full_name,
        refId: tx.id,
      });
    }

    // ترتيب الحركات زمنياً لحساب الرصيد التراكمي
    allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = Number(treasury.opening_balance || 0);
    let totalInAll = 0;
    let totalOutAll = 0;

    const fullStatement: (StatementEvent & { balance: number })[] = [];

    for (const ev of allEvents) {
      runningBalance = runningBalance + ev.amountIn - ev.amountOut;
      totalInAll += ev.amountIn;
      totalOutAll += ev.amountOut;

      fullStatement.push({
        ...ev,
        balance: runningBalance,
      });
    }

    // تطبيق فلاتر البحث والتواريخ ونوع الحركة
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

    if (search) {
      filteredItems = filteredItems.filter(
        (i) =>
          (i.label && i.label.toLowerCase().includes(search)) ||
          (i.category && i.category.toLowerCase().includes(search)) ||
          (i.party && i.party.toLowerCase().includes(search)) ||
          (i.notes && i.notes.toLowerCase().includes(search)) ||
          (i.user && i.user.toLowerCase().includes(search))
      );
    }

    // إجماليات الفترة المفلترة
    const periodIn = filteredItems.reduce((s, i) => s + i.amountIn, 0);
    const periodOut = filteredItems.reduce((s, i) => s + i.amountOut, 0);
    const periodNet = periodIn - periodOut;

    // عكس الترتيب لعرض الأحدث أولاً في شاشة العرض
    const displayItems = [...filteredItems].reverse();

    return NextResponse.json({
      ok: true,
      data: {
        treasury: {
          id: treasury.id,
          name: treasury.name,
          type: treasury.type,
          opening_balance: Number(treasury.opening_balance || 0),
          current_balance: Number(treasury.current_balance || 0),
          calculated_balance: runningBalance,
          assigned_user: assignedUserName,
          notes: treasury.notes,
        },
        summary: {
          opening_balance: Number(treasury.opening_balance || 0),
          total_in: totalInAll,
          total_out: totalOutAll,
          current_balance: Number(treasury.current_balance || 0),
          calculated_balance: runningBalance,
          period_in: periodIn,
          period_out: periodOut,
          period_net: periodNet,
          movement_count: filteredItems.length,
          total_count: fullStatement.length,
        },
        items: displayItems.map((i) => ({
          ...i,
          date: i.date.toISOString(),
        })),
      },
    });
  } catch (e: any) {
    console.error("Error loading treasury statement:", e);
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء تحميل كشف الحساب" } },
      { status: 500 }
    );
  }
}
