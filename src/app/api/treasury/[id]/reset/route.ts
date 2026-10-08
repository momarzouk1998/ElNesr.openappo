import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// POST /api/treasury/[id]/reset — تصفير خزينة محددة
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile || !["admin", "manager", "accountant"].includes(profile.role)) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "تصفير الخزائن خاص بالإدارة فقط" } },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const targetTreasury = await prisma.treasuries.findUnique({ where: { id } });

    if (!targetTreasury) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "الخزينة غير موجودة" } },
        { status: 404 }
      );
    }

    const tid = targetTreasury.id;

    // تنفيذ التصفير داخل transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. مسح حركات الخزينة المباشرة والتحويلات
      const deletedTx = await tx.treasury_transactions.deleteMany({
        where: {
          OR: [
            { treasury_id: tid },
            { from_treasury_id: tid },
            { to_treasury_id: tid },
          ],
        },
      });

      // 2. فك ارتباط المدفوعات والمصروفات والتسويات بالخزينة حتى لا تعود عند إعادة الحساب
      await Promise.all([
        tx.customer_payments.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
        tx.supplier_payments.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
        tx.expenses.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
        tx.customer_adjustments.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
        tx.supplier_adjustments.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
        tx.employee_advances.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
        tx.salary_payments.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
        tx.partner_withdrawals.updateMany({
          where: { treasury_id: tid },
          data: { treasury_id: null },
        }),
      ]);

      // 3. تصفير رصيد الخزينة الحالي والافتتاحي
      const updated = await tx.treasuries.update({
        where: { id: tid },
        data: {
          opening_balance: 0,
          current_balance: 0,
          updated_at: new Date(),
        },
      });

      return {
        treasury: updated,
        deletedTransactionsCount: deletedTx.count,
      };
    });

    return NextResponse.json({
      ok: true,
      data: result,
      message: `تم تصفير خزينة (${targetTreasury.name}) بنجاح، وتصفير رصيدها إلى 0.00 ج.م ومسح ${result.deletedTransactionsCount} حركة متعلقة بها.`,
    });
  } catch (e: any) {
    console.error("Error resetting treasury:", e);
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء تصفير الخزينة" } },
      { status: 500 }
    );
  }
}
