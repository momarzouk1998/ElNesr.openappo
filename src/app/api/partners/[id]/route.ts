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
    const partner = await prisma.partners.findUnique({
      where: { id },
      include: {
        withdrawals: {
          orderBy: { withdrawal_date: "desc" },
          include: { treasury: { select: { id: true, name: true } } },
        },
      },
    });

    if (!partner) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: partner });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بتعديل بيانات الشريك" } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const data: any = { updated_at: new Date() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "اسم الشريك لا يمكن أن يكون فارغاً" } }, { status: 400 });
      data.name = name;
    }
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
    if (body.share_percentage !== undefined) data.share_percentage = body.share_percentage !== null && body.share_percentage !== "" ? Number(body.share_percentage) : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
    if (body.is_active !== undefined) data.is_active = Boolean(body.is_active);

    const updated = await prisma.partners.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "فقط المدير يمكنه حذف الشريك" } }, { status: 403 });
  }

  try {
    const { id } = await params;
    const count = await prisma.partner_withdrawals.count({ where: { partner_id: id } });
    if (count > 0) {
      await prisma.partners.update({
        where: { id },
        data: { is_active: false, updated_at: new Date() },
      });
      return NextResponse.json({ ok: true, message: "تم تعطيل الشريك بنجاح لوجود مسحوبات مسجلة له" });
    }

    await prisma.partners.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "تم حذف الشريك بنجاح" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message } }, { status: 500 });
  }
}
