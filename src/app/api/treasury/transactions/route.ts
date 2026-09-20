import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// POST /api/treasury/transactions — تسجيل إيداع نقدي مباشر أو سحب نقدي مباشر حر
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "غير مسجل الدخول" } }, { status: 401 });
  }

  if (!["admin", "manager", "accountant"].includes(profile.role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بتسجيل حركات نقدية مباشرة" } }, { status: 403 });
  }

  try {
    const body = await request.json();
    const treasuryId = String(body.treasury_id || "");
    const type = String(body.type || ""); // 'deposit' (إيداع) | 'withdrawal' (سحب)
    const amount = Number(body.amount);
    const transactionDate = body.transaction_date ? new Date(body.transaction_date) : new Date();
    const title = body.title ? String(body.title).trim() : "";
    const notes = body.notes ? String(body.notes).trim() : "";

    if (!treasuryId) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "يرجى تحديد الخزينة" } }, { status: 400 });
    }

    if (!["deposit", "withdrawal"].includes(type)) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "نوع الحركة يجب أن يكون إيداع أو سحب" } }, { status: 400 });
    }

    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقماً موجباً أكبر من الصفر" } }, { status: 400 });
    }

    const treasury = await prisma.treasuries.findUnique({ where: { id: treasuryId } });
    if (!treasury || !treasury.is_active) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "الخزينة غير موجودة أو معطلة" } }, { status: 404 });
    }

    const fullNotes = title ? (notes ? `${title} - ${notes}` : title) : (notes || (type === "deposit" ? "إيداع نقدي مباشر" : "سحب نقدي مباشر"));
    const direction = type === "deposit" ? "in" : "out";
    const refType = type === "deposit" ? "direct_deposit" : "direct_withdrawal";

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update treasury balance
      const updatedTreasury = await tx.treasuries.update({
        where: { id: treasuryId },
        data: {
          current_balance: type === "deposit"
            ? { increment: amount }
            : { decrement: amount },
          updated_at: new Date(),
        },
      });

      // 2. Create treasury transaction ledger entry
      const transaction = await tx.treasury_transactions.create({
        data: {
          treasury_id: treasuryId,
          direction,
          amount,
          reference_type: refType,
          transaction_date: transactionDate,
          notes: fullNotes,
          by_user_id: profile.id,
          status: "accepted",
        },
        include: {
          treasury: { select: { id: true, name: true } },
          by_user: { select: { id: true, full_name: true } },
        },
      });

      return { transaction, newBalance: Number(updatedTreasury.current_balance) };
    });

    return NextResponse.json({
      ok: true,
      data: result.transaction,
      message: type === "deposit"
        ? `تم تسجيل إيداع مبلغ ${amount} ج بنجاح في (${treasury.name})`
        : `تم تسجيل سحب مبلغ ${amount} ج بنجاح من (${treasury.name})`,
    }, { status: 201 });
  } catch (e: any) {
    console.error("Error creating direct treasury transaction:", e);
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء حفظ الحركة النقدية" } }, { status: 500 });
  }
}
