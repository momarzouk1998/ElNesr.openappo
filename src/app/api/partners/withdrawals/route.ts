import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get("partner_id") || undefined;
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (partnerId) where.partner_id = partnerId;

    if (fromDate || toDate) {
      where.withdrawal_date = {};
      if (fromDate) where.withdrawal_date.gte = new Date(fromDate);
      if (toDate) where.withdrawal_date.lte = new Date(toDate);
    }

    if (search.trim()) {
      where.OR = [
        { notes: { contains: search.trim(), mode: "insensitive" } },
        { partner: { name: { contains: search.trim(), mode: "insensitive" } } },
      ];
    }

    const [totalCount, items, aggregate] = await Promise.all([
      prisma.partner_withdrawals.count({ where }),
      prisma.partner_withdrawals.findMany({
        where,
        orderBy: { withdrawal_date: "desc" },
        skip,
        take: limit,
        include: {
          partner: { select: { id: true, name: true, phone: true } },
          treasury: { select: { id: true, name: true } },
        },
      }),
      prisma.partner_withdrawals.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    const partnerTotalsRaw = await prisma.partner_withdrawals.groupBy({
      by: ["partner_id"],
      where,
      _sum: { amount: true },
      _count: true,
    });

    return NextResponse.json({
      ok: true,
      data: {
        items,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
        totalAmount: Number(aggregate._sum.amount || 0),
        partnerTotals: partnerTotalsRaw.map(pt => ({
          partner_id: pt.partner_id,
          total: Number(pt._sum.amount || 0),
          count: pt._count,
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  if (profile.role !== "admin" && profile.role !== "manager" && profile.role !== "accountant") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بتسجيل مسحوبات الشركاء" } }, { status: 403 });
  }

  try {
    const body = await request.json();
    const partnerId = String(body.partner_id || "");
    const amount = Number(body.amount);
    const withdrawalDate = body.withdrawal_date ? new Date(body.withdrawal_date) : new Date();
    const treasuryId = body.treasury_id ? String(body.treasury_id) : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!partnerId) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "يرجى اختيار الشريك" } }, { status: 400 });
    }

    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "المبلغ يجب أن يكون رقماً موجباً أكبر من الصفر" } }, { status: 400 });
    }

    const partner = await prisma.partners.findUnique({ where: { id: partnerId } });
    if (!partner) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "الشريك غير موجود" } }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.partner_withdrawals.create({
        data: {
          partner_id: partnerId,
          amount,
          withdrawal_date: withdrawalDate,
          treasury_id: treasuryId,
          notes,
          created_by_user_id: profile.id,
        },
        include: {
          partner: { select: { id: true, name: true } },
          treasury: { select: { id: true, name: true } },
        },
      });

      if (treasuryId) {
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
            reference_type: "partner_withdrawal",
            reference_id: withdrawal.id,
            notes: notes ? `مسحوبات شريك: ${partner.name} - ${notes}` : `مسحوبات شريك: ${partner.name}`,
            by_user_id: profile.id,
            status: "accepted",
          },
        });
      }

      return withdrawal;
    });

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
