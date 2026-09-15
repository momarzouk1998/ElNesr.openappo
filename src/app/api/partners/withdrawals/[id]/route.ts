import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بحذف مسحوبات الشركاء" } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.partner_withdrawals.findUnique({
      where: { id },
      include: { partner: true },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "سجل السحب غير موجود" } }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (existing.treasury_id) {
        await tx.treasuries.update({
          where: { id: existing.treasury_id },
          data: {
            current_balance: { increment: existing.amount },
            updated_at: new Date(),
          },
        });

        await tx.treasury_transactions.deleteMany({
          where: {
            reference_type: "partner_withdrawal",
            reference_id: id,
          },
        });
      }

      await tx.partner_withdrawals.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, message: "تم حذف حركة السحب بنجاح واسترجاع المبلغ للخزينة إن وُجدت" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
