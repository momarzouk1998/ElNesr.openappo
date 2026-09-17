import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth-server";

// POST /api/partners/reset - تصفير حساب الشركاء (حذف سجلات المسحوبات صامتاً بدون استرجاع للخزينة)
export async function POST(request: NextRequest) {
  const profile = await getCurrentUser();
  if (!profile) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "غير مسجل الدخول" } }, { status: 401 });
  }

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "غير مصرح لك بتصفير حسابات الشركاء (خاص بالإدارة فقط)" } }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const partnerId = body.partner_id && body.partner_id !== "all" ? String(body.partner_id) : undefined;

    if (partnerId) {
      const partner = await prisma.partners.findUnique({ where: { id: partnerId } });
      if (!partner) {
        return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "الشريك غير موجود" } }, { status: 404 });
      }

      // حذف مسحوبات هذا الشريك فقط بدون المساس بأرصدة الخزائن
      const result = await prisma.partner_withdrawals.deleteMany({
        where: { partner_id: partnerId },
      });

      return NextResponse.json({
        ok: true,
        data: { count: result.count, partner_id: partnerId },
        message: `تم تصفير حساب الشريك (${partner.name}) ومسح ${result.count} حركة سحب بنجاح دون التأثير على رصيد الخزينة`,
      });
    } else {
      // تصفير جميع مسحوبات الشركاء بالكامل
      const result = await prisma.partner_withdrawals.deleteMany({});

      return NextResponse.json({
        ok: true,
        data: { count: result.count },
        message: `تم تصفير جميع حسابات الشركاء ومسح ${result.count} حركة سحب بنجاح دون التأثير على رصيد الخزينة`,
      });
    }
  } catch (e: any) {
    console.error("Error resetting partner accounts:", e);
    return NextResponse.json({ ok: false, error: { code: "DB_ERROR", message: e?.message || "حدث خطأ أثناء تصفير الحسابات" } }, { status: 500 });
  }
}
