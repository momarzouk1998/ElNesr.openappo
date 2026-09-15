import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { id } = await params;

    const [supplier, purchases, payments, returns, adjustments] = await Promise.all([
      prisma.suppliers.findUnique({ where: { id } }),

      prisma.purchase_invoices.findMany({
        where: { supplier_id: id, status: { not: "ملغاة" } },
        orderBy: { purchase_date: "asc" },
        select: {
          id: true,
          purchase_number: true,
          purchase_date: true,
          total_amount: true,
          status: true,
          items: {
            select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
          },
        },
      }),

      prisma.supplier_payments.findMany({
        where: { supplier_id: id },
        orderBy: { payment_date: "asc" },
        select: { id: true, payment_date: true, amount: true, payment_method: true, notes: true },
      }),

      prisma.supplier_return_invoices.findMany({
        where: { supplier_id: id, status: { not: "ملغاة" } },
        orderBy: { return_date: "asc" },
        select: {
          id: true,
          return_number: true,
          return_date: true,
          total_amount: true,
          items: {
            select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
          },
        },
      }),

      prisma.supplier_adjustments.findMany({
        where: { supplier_id: id },
        orderBy: { adjustment_date: "asc" },
        select: {
          id: true,
          adjustment_date: true,
          amount: true,
          type: true,
          notes: true,
          treasury: { select: { name: true } },
        },
      }),
    ]);

    if (!supplier) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    // For suppliers: balance positive means we owe them (credit), negative means they owe us (debit)
    let running = Number(supplier.opening_balance || 0);
    let totalDebit = 0;
    let totalCredit = 0;
    const entries: any[] = [];

    if (Number(supplier.opening_balance || 0) !== 0) {
      const op = Number(supplier.opening_balance);
      const isCredit = op > 0;
      if (isCredit) totalCredit += op; else totalDebit += Math.abs(op);
      entries.push({
        id: "opening",
        date: "1970-01-01",
        type: "opening",
        label: "رصيد افتتاحي",
        ref: "—",
        debit: !isCredit ? Math.abs(op) : 0,
        credit: isCredit ? op : 0,
        balance: running,
      });
    }

    const allEvents: { date: Date; type: "purchase" | "payment" | "return" | "adjustment"; data: any }[] = [
      ...purchases.map((p) => ({ date: new Date(p.purchase_date), type: "purchase" as const, data: p })),
      ...payments.map((pay) => ({ date: new Date(pay.payment_date), type: "payment" as const, data: pay })),
      ...returns.map((r) => ({ date: new Date(r.return_date), type: "return" as const, data: r })),
      ...adjustments.map((a) => ({ date: new Date(a.adjustment_date), type: "adjustment" as const, data: a })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const ev of allEvents) {
      if (ev.type === "purchase") {
        const amt = Number(ev.data.total_amount);
        running += amt;
        totalCredit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "purchase",
          label: "فاتورة مشتريات",
          ref: `#${ev.data.purchase_number}`,
          debit: 0,
          credit: amt,
          balance: running,
          items: ev.data.items,
        });
      } else if (ev.type === "payment") {
        const amt = Number(ev.data.amount);
        running -= amt;
        totalDebit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "payment",
          label: `سداد للمورد (${ev.data.payment_method})`,
          ref: ev.data.notes || "سداد نقدية",
          debit: amt,
          credit: 0,
          balance: running,
        });
      } else if (ev.type === "return") {
        const amt = Number(ev.data.total_amount);
        running -= amt;
        totalDebit += amt;
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "return",
          label: "مرتجع مشتريات",
          ref: `#${ev.data.return_number}`,
          debit: amt,
          credit: 0,
          balance: running,
          items: ev.data.items,
        });
      } else if (ev.type === "adjustment") {
        const amt = Number(ev.data.amount);
        const isCredit = ev.data.type === "credit"; // credit = إضافة له, debit = خصم منه
        if (isCredit) {
          running += amt;
          totalCredit += amt;
        } else {
          running -= amt;
          totalDebit += amt;
        }
        entries.push({
          id: ev.data.id,
          date: ev.date.toISOString(),
          type: "adjustment",
          label: isCredit ? "إضافة مستحق للمورد" : "خصم / استرداد من المورد",
          ref: ev.data.notes + (ev.data.treasury?.name ? ` (${ev.data.treasury.name})` : ""),
          debit: !isCredit ? amt : 0,
          credit: isCredit ? amt : 0,
          balance: running,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        supplier,
        entries,
        totalDebit,
        totalCredit,
        finalBalance: running,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
