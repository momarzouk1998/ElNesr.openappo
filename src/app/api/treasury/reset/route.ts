import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// POST /api/treasury/reset — تصفير خزينة محددة بالكامل ومسح حركاتها وتصفير رصيدها
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile || !["admin", "manager", "accountant"].includes(profile.role)) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "تصفير الخزائن خاص بالإدارة فقط" } },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const treasuryId = body.treasury_id ? String(body.treasury_id) : undefined;
    const nameSearch = body.name ? String(body.name).trim() : undefined;

    let targetTreasury = null;

    if (treasuryId) {
      targetTreasury = await prisma.treasuries.findUnique({ where: { id: treasuryId } });
    } else if (nameSearch) {
      // بحث بالاسم (مثلاً موسى أو موسي)
      const cleanName = nameSearch.replace(/[ىي]/g, "_");
      targetTreasury = await prisma.treasuries.findFirst({
        where: {
          OR: [
            { name: { contains: nameSearch, mode: "insensitive" } },
            { name: { contains: nameSearch.replace(/ى/g, "ي"), mode: "insensitive" } },
            { name: { contains: nameSearch.replace(/ي/g, "ى"), mode: "insensitive" } },
          ],
        },
      });
    }

    if (!targetTreasury) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "لم يتم العثور على الخزينة المستهدفة" } },
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
      message: `تم تصفير خزينة (${targetTreasury.name}) بنجاح، وتصفير رصيدها الافتتاحي والحالي إلى 0.00 ج.م ومسح ${result.deletedTransactionsCount} حركة متعلقة بها.`,
    });
  } catch (e: any) {
    console.error("Error resetting treasury:", e);
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء تصفير الخزينة" } },
      { status: 500 }
    );
  }
}
