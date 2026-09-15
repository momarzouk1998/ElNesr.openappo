import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const partners = await prisma.partners.findMany({
      where: { is_active: true },
      orderBy: { created_at: "asc" },
      include: {
        _count: {
          select: { withdrawals: true },
        },
        withdrawals: {
          select: { amount: true },
        },
      },
    });

    const data = partners.map((p) => {
      const totalWithdrawn = p.withdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);
      const { withdrawals, ...rest } = p;
      return {
        ...rest,
        totalWithdrawn,
        withdrawalsCount: p._count.withdrawals,
      };
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بإضافة شريك" } }, { status: 403 });
  }

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "اسم الشريك مطلوب" } }, { status: 400 });
    }

    const partner = await prisma.partners.create({
      data: {
        name,
        phone: body.phone ? String(body.phone).trim() : null,
        share_percentage: body.share_percentage !== undefined && body.share_percentage !== null && body.share_percentage !== "" ? Number(body.share_percentage) : null,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });

    return NextResponse.json({ ok: true, data: partner }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
