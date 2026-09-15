import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";

// GET /api/customers/adjustments — جلب قائمة السلف والتسويات لجميع العملاء أو عميل محدد
export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id") || "";
    const treasuryId = searchParams.get("treasury_id") || "";
    const type = searchParams.get("type") || ""; // debit (سلفة) | credit (خصم)
    const search = searchParams.get("search") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Prisma.customer_adjustmentsWhereInput = {};

    if (customerId) where.customer_id = customerId;
    if (treasuryId) where.treasury_id = treasuryId;
    if (type === "debit" || type === "credit") where.type = type;

    if (from || to) {
      where.adjustment_date = {};
      if (from) where.adjustment_date.gte = new Date(from);
      if (to) where.adjustment_date.lte = new Date(to);
    }

    if (search.trim()) {
      where.OR = [
        { customer: { name: { contains: search.trim(), mode: "insensitive" } } },
        { customer: { phone: { contains: search.trim() } } },
        { notes: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [items, total, debitSum, creditSum] = await Promise.all([
      prisma.customer_adjustments.findMany({
        where,
        orderBy: { adjustment_date: "desc" },
        take: limit,
        skip: offset,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          treasury: { select: { id: true, name: true } },
        },
      }),
      prisma.customer_adjustments.count({ where }),
      prisma.customer_adjustments.aggregate({
        where: { ...where, type: "debit" },
        _sum: { amount: true },
      }),
      prisma.customer_adjustments.aggregate({
        where: { ...where, type: "credit" },
        _sum: { amount: true },
      }),
    ]);

    // Attach creator names if available
    const userIds = [...new Set(items.map((i) => i.created_by_user_id).filter(Boolean))] as number[];
    const users = userIds.length > 0
      ? await prisma.users.findMany({
          where: { id: { in: userIds } },
          select: { id: true, full_name: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.full_name]));

    const enrichedItems = items.map((item) => ({
      ...item,
      creator_name: item.created_by_user_id ? userMap.get(item.created_by_user_id) || null : null,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        items: enrichedItems,
        total,
        total_debit: Number(debitSum._sum.amount || 0),
        total_credit: Number(creditSum._sum.amount || 0),
        limit,
        offset,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
