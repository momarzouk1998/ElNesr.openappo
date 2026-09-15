import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/customers/adjustments/[adjId] — جلب تفاصيل سلفة/تسوية عميل لإصدار الإيصال
export async function GET(_request: NextRequest, { params }: { params: Promise<{ adjId: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  try {
    const { adjId } = await params;
    const adjustment = await prisma.customer_adjustments.findUnique({
      where: { id: adjId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            balance: true,
            opening_balance: true,
          },
        },
        treasury: { select: { id: true, name: true } },
      },
    });

    if (!adjustment) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "سجل السلفة/التسوية غير موجود" } }, { status: 404 });
    }

    let creatorName: string | null = null;
    if (adjustment.created_by_user_id) {
      const creator = await prisma.users.findUnique({
        where: { id: adjustment.created_by_user_id },
        select: { full_name: true },
      });
      creatorName = creator?.full_name || null;
    }

    // حساب الرصيد السابق والرصيد الجديد بدقة مطابقة لكشف الحساب
    let prevBalance = 0;
    let newBalance = 0;

    if (adjustment.customer) {
      const customerId = adjustment.customer.id;
      const adjCreatedAt = adjustment.created_at || adjustment.adjustment_date || new Date();
      const opening = Number(adjustment.customer.opening_balance || 0);

      const [priorInvoices, priorPayments, priorReturns, priorDebits, priorCredits] = await Promise.all([
        prisma.sales_invoices.aggregate({
          where: { customer_id: customerId, status: { not: "ملغاة" }, created_at: { lt: adjCreatedAt } },
          _sum: { total: true },
        }),
        prisma.customer_payments.aggregate({
          where: { customer_id: customerId, created_at: { lt: adjCreatedAt } },
          _sum: { amount: true },
        }),
        prisma.customer_return_invoices.aggregate({
          where: { customer_id: customerId, status: { not: "ملغاة" }, created_at: { lt: adjCreatedAt } },
          _sum: { total_amount: true },
        }),
        prisma.customer_adjustments.aggregate({
          where: { customer_id: customerId, id: { not: adjustment.id }, type: "debit", created_at: { lt: adjCreatedAt } },
          _sum: { amount: true },
        }),
        prisma.customer_adjustments.aggregate({
          where: { customer_id: customerId, id: { not: adjustment.id }, type: "credit", created_at: { lt: adjCreatedAt } },
          _sum: { amount: true },
        }),
      ]);

      prevBalance =
        opening +
        Number(priorInvoices._sum.total || 0) +
        Number(priorDebits._sum.amount || 0) -
        Number(priorPayments._sum.amount || 0) -
        Number(priorReturns._sum.total_amount || 0) -
        Number(priorCredits._sum.amount || 0);

      const adjAmount = Number(adjustment.amount);
      newBalance = adjustment.type === "debit" ? prevBalance + adjAmount : prevBalance - adjAmount;
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...adjustment,
        creator: creatorName ? { full_name: creatorName } : null,
        prev_balance: prevBalance,
        new_balance: newBalance,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

// DELETE /api/customers/adjustments/[adjId] - حذف سلفة أو تسوية
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ adjId: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بحذف الحركة" } }, { status: 403 });
  }

  try {
    const { adjId } = await params;
    const existing = await prisma.customer_adjustments.findUnique({
      where: { id: adjId },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "السجل غير موجود" } }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Revert customer balance:
      // If was debit (+ balance), subtract it (- amount)
      // If was credit (- balance), add it (+ amount)
      const reverseDelta = existing.type === "debit" ? -Number(existing.amount) : Number(existing.amount);
      await tx.customers.update({
        where: { id: existing.customer_id },
        data: {
          balance: { increment: reverseDelta },
          updated_at: new Date(),
        },
      });

      // Revert treasury if attached:
      if (existing.treasury_id) {
        if (existing.type === "debit") {
          await tx.treasuries.update({
            where: { id: existing.treasury_id },
            data: { current_balance: { increment: Number(existing.amount) } },
          });
        } else {
          await tx.treasuries.update({
            where: { id: existing.treasury_id },
            data: { current_balance: { decrement: Number(existing.amount) } },
          });
        }

        await tx.treasury_transactions.deleteMany({
          where: {
            reference_type: "customer_adjustment",
            reference_id: adjId,
          },
        });
      }

      await tx.customer_adjustments.delete({ where: { id: adjId } });
    });

    return NextResponse.json({ ok: true, message: "تم حذف الحركة بنجاح وإعادة ضبط الأرصدة" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
