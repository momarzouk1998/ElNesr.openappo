import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// GET /api/treasury/transfers — قائمة التحويلات بين الخزائن
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const treasuryId = searchParams.get("treasury_id") || "";
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: any = {
    reference_type: "treasury_transfer",
  };
  if (treasuryId) {
    where.treasury_id = treasuryId;
  }

  const [items, total] = await Promise.all([
    prisma.treasury_transactions.findMany({
      where,
      orderBy: { transaction_date: "desc" },
      take: limit,
      skip: offset,
      include: {
        treasury: { select: { id: true, name: true } },
        by_user: { select: { id: true, full_name: true } },
      },
    }),
    prisma.treasury_transactions.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data: { items, total, limit, offset } });
}

// POST /api/treasury/transfers — تحويل نقدية بين خزائن
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // admin, manager, accountant يستطيعون تحويل النقدية
  if (!["admin", "manager", "accountant"].includes(profile.role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بتحويل النقدية بين الخزائن" } }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { from_treasury_id, to_treasury_id, amount, notes, transfer_date } = body;

    if (!from_treasury_id || !to_treasury_id || !amount) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "الخزينة المصدر والخزينة الوجهة والمبلغ مطلوبة" } },
        { status: 400 }
      );
    }

    if (from_treasury_id === to_treasury_id) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "لا يمكن التحويل لنفس الخزينة" } }, { status: 400 });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقماً موجباً أكبر من الصفر" } }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. تحقق من وجود الخزائن
      const [fromTreasury, toTreasury] = await Promise.all([
        tx.treasuries.findUnique({ where: { id: from_treasury_id } }),
        tx.treasuries.findUnique({ where: { id: to_treasury_id } }),
      ]);

      if (!fromTreasury) throw new Error("الخزينة المصدر غير موجودة");
      if (!toTreasury) throw new Error("خزينة الوجهة غير موجودة");

      // 2. خصم المبلغ من الخزينة المصدر
      const updatedFrom = await tx.treasuries.update({
        where: { id: from_treasury_id },
        data: { current_balance: { decrement: amt }, updated_at: new Date() },
      });

      // 3. إضافة المبلغ لخزينة الوجهة
      const updatedTo = await tx.treasuries.update({
        where: { id: to_treasury_id },
        data: { current_balance: { increment: amt }, updated_at: new Date() },
      });

      const transferDate = transfer_date ? new Date(transfer_date) : new Date();
      const transferUuid = crypto.randomUUID();

      const cleanNotes = notes ? String(notes).trim() : "";
      const outNotes = cleanNotes
        ? `تحويل نقدية إلى (${toTreasury.name}) - ${cleanNotes}`
        : `تحويل نقدية إلى (${toTreasury.name})`;
      const inNotes = cleanNotes
        ? `تحويل نقدية من (${fromTreasury.name}) - ${cleanNotes}`
        : `تحويل نقدية من (${fromTreasury.name})`;

      // 4. تسجيل حركة الخصم (transfer_out)
      await tx.treasury_transactions.create({
        data: {
          treasury_id: from_treasury_id,
          direction: "transfer_out",
          amount: amt,
          from_treasury_id,
          to_treasury_id,
          reference_type: "treasury_transfer",
          reference_id: transferUuid,
          status: "accepted",
          notes: outNotes,
          by_user_id: profile.id,
          transaction_date: transferDate,
        },
      });

      // 5. تسجيل حركة الإضافة (transfer_in)
      await tx.treasury_transactions.create({
        data: {
          treasury_id: to_treasury_id,
          direction: "transfer_in",
          amount: amt,
          from_treasury_id,
          to_treasury_id,
          reference_type: "treasury_transfer",
          reference_id: transferUuid,
          status: "accepted",
          notes: inNotes,
          by_user_id: profile.id,
          transaction_date: transferDate,
        },
      });

      return {
        transfer_id: transferUuid,
        from_treasury: fromTreasury.name,
        to_treasury: toTreasury.name,
        amount: amt,
        from_new_balance: Number(updatedFrom.current_balance),
        to_new_balance: Number(updatedTo.current_balance),
        message: `تم تحويل مبلغ ${amt} ج من (${fromTreasury.name}) إلى (${toTreasury.name}) بنجاح`,
      };
    });

    return NextResponse.json({ ok: true, data: result, message: result.message }, { status: 201 });
  } catch (e: any) {
    console.error("Error in treasury transfer:", e);
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء تنفيذ التحويل" } }, { status: 500 });
  }
}