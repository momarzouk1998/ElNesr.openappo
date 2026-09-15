import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const { id } = await params;
    const adjustments = await prisma.customer_adjustments.findMany({
      where: { customer_id: id },
      orderBy: { adjustment_date: "desc" },
      include: {
        treasury: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ok: true, data: adjustments });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const amount = Number(body.amount);
    const type = body.type === "credit" ? "credit" : "debit"; // debit = إضافة عليه / سلفة, credit = خصم منه / تسوية لصالحه
    const adjustmentDate = body.adjustment_date ? new Date(body.adjustment_date) : new Date();
    const treasuryId = body.treasury_id ? String(body.treasury_id) : null;
    const notes = String(body.notes || "").trim();

    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقماً موجباً أكبر من الصفر" } }, { status: 400 });
    }

    if (!notes) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "يرجى كتابة سبب / بيان التسوية أو السلفة" } }, { status: 400 });
    }

    const customer = await prisma.customers.findUnique({ where: { id } });
    if (!customer) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "العميل غير موجود" } }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.customer_adjustments.create({
        data: {
          customer_id: id,
          amount,
          type,
          adjustment_date: adjustmentDate,
          treasury_id: treasuryId,
          notes,
          created_by_user_id: profile.id,
        },
        include: {
          treasury: { select: { id: true, name: true } },
        },
      });

      // Update customer balance:
      // debit (سلفة / إضافة عليه): customer owes us more -> balance increases (+ amount)
      // credit (خصم منه / تسوية لصالحه): customer owes us less -> balance decreases (- amount)
      const balanceDelta = type === "debit" ? amount : -amount;
      await tx.customers.update({
        where: { id },
        data: {
          balance: { increment: balanceDelta },
          updated_at: new Date(),
        },
      });

      // If treasury was selected:
      // debit (سلفة نقدية منصرفة من الخزينة): treasury cash decreases (out)
      // credit (إيداع نقدي أو تسوية مقبوضة): treasury cash increases (in)
      if (treasuryId) {
        if (type === "debit") {
          await tx.treasuries.update({
            where: { id: treasuryId },
            data: {
              current_balance: { decrement: amount },
              updated_at: new Date(),
            },
          });

          await tx.treasury_transactions.create({
            data: {
              treasury_id: treasuryId,
              direction: "out",
              amount,
              reference_type: "customer_adjustment",
              reference_id: adjustment.id,
              notes: `سلفة نقدية لعميل (${customer.name}): ${notes}`,
              by_user_id: profile.id,
              status: "accepted",
            },
          });
        } else {
          await tx.treasuries.update({
            where: { id: treasuryId },
            data: {
              current_balance: { increment: amount },
              updated_at: new Date(),
            },
          });

          await tx.treasury_transactions.create({
            data: {
              treasury_id: treasuryId,
              direction: "in",
              amount,
              reference_type: "customer_adjustment",
              reference_id: adjustment.id,
              notes: `تسوية حساب عميل (${customer.name}): ${notes}`,
              by_user_id: profile.id,
              status: "accepted",
            },
          });
        }
      }

      return adjustment;
    });

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
