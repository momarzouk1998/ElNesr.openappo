import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; adjId: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بحذف التسوية" } }, { status: 403 });
  }

  try {
    const { id, adjId } = await params;
    const existing = await prisma.customer_adjustments.findUnique({
      where: { id: adjId },
    });

    if (!existing || existing.customer_id !== id) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "سجل التسوية غير موجود" } }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Revert customer balance:
      const reverseDelta = existing.type === "debit" ? -Number(existing.amount) : Number(existing.amount);
      await tx.customers.update({
        where: { id },
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

    return NextResponse.json({ ok: true, message: "تم حذف حركة التسوية بنجاح وإعادة ضبط الأرصدة" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
