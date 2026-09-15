import { prisma } from "@/lib/db/prisma-direct";
import { notFound } from "next/navigation";
import { formatEGP, formatDate } from "@/lib/format";
import PrintActions from "@/app/print/invoice/[id]/PrintActions";
import { LOGO_BASE64 } from "@/lib/logo-base64";

export const dynamic = "force-dynamic";

const C = {
  navy: "#0f4185",
  darkNavy: "#002b61",
  orange: "#f7941d",
  emerald: "#059669",
  darkEmerald: "#047857",
  lightBg: "#f8fafc",
  border: "#cbd5e1",
  borderDark: "#94a3b8",
  text: "#0f172a",
  muted: "#475569",
  red: "#dc2626",
  amber: "#d97706",
  white: "#ffffff",
} as const;

export default async function CustomerAdjustmentPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string; download_image?: string; download_pdf?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const autoprint = sp.autoprint === "1";
  const downloadImage = sp.download_image === "1";
  const downloadPdf = sp.download_pdf === "1";

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) notFound();

  const adjustment = await prisma.customer_adjustments.findUnique({
    where: { id },
    include: {
      customer: true,
      treasury: true,
    },
  });

  if (!adjustment || !adjustment.customer) notFound();

  let creatorName: string | null = null;
  if (adjustment.created_by_user_id) {
    const creator = await prisma.users.findUnique({
      where: { id: adjustment.created_by_user_id },
      select: { full_name: true },
    });
    creatorName = creator?.full_name || null;
  }

  const customerId = adjustment.customer.id;
  const adjDate = adjustment.adjustment_date || adjustment.created_at || new Date();
  const adjCreatedAt = adjustment.created_at || adjDate;
  const opening = Number(adjustment.customer.opening_balance || 0);

  const [priorInvoices, priorPayments, priorReturns, priorDebits, priorCredits] = await Promise.all([
    prisma.sales_invoices.aggregate({
      where: { customer_id: customerId, status: { not: "ملغاة" }, created_at: { lt: adjCreatedAt } },
      _sum: { total: true },
    }),
    prisma.customer_payments.aggregate({
      where: { customer_id: customerId, created_at: { lt: adjCreatedAt } },
      _sum: { amount: true },
    }),
    prisma.customer_return_invoices.aggregate({
      where: { customer_id: customerId, status: { not: "ملغاة" }, created_at: { lt: adjCreatedAt } },
      _sum: { total_amount: true },
    }),
    prisma.customer_adjustments.aggregate({
      where: { customer_id: customerId, id: { not: adjustment.id }, type: "debit", created_at: { lt: adjCreatedAt } },
      _sum: { amount: true },
    }),
    prisma.customer_adjustments.aggregate({
      where: { customer_id: customerId, id: { not: adjustment.id }, type: "credit", created_at: { lt: adjCreatedAt } },
      _sum: { amount: true },
    }),
  ]);

  const prevBalance =
    opening +
    Number(priorInvoices._sum.total || 0) +
    Number(priorDebits._sum.amount || 0) -
    Number(priorPayments._sum.amount || 0) -
    Number(priorReturns._sum.total_amount || 0) -
    Number(priorCredits._sum.amount || 0);

  const adjAmount = Number(adjustment.amount);
  const isDebit = adjustment.type === "debit"; // سلفة / إضافة على الحساب
  const newBalance = isDebit ? prevBalance + adjAmount : prevBalance - adjAmount;

  const docTitle = isDebit ? "إيصال سلفة نقدية" : "إيصال تسوية حساب";

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#e2e8f0",
        padding: "1rem 0.5rem",
        fontFamily: "'Cairo', 'Segoe UI', Tahoma, sans-serif",
      }}
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            direction: rtl !important;
          }
          .no-print {
            display: none !important;
          }
          #statement {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      <PrintActions
        autoprint={autoprint}
        downloadImage={downloadImage}
        downloadPdf={downloadPdf}
        fileName={`${docTitle}_${adjustment.customer.name}_${formatDate(adjDate)}`}
        targetId="statement"
        customerId={adjustment.customer.id}
        customerName={adjustment.customer.name}
        customerPhone={adjustment.customer.phone}
        title={docTitle}
        backLink={`/customers/${adjustment.customer.id}`}
        backLabel="↩️ العودة لصفحة العميل"
      />

      <div
        id="statement"
        className="print-page"
        style={{
          maxWidth: "650px",
          margin: "0 auto",
          backgroundColor: C.white,
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 10px 32px rgba(0,0,0,0.12)",
          border: `1.5px solid ${C.borderDark}`,
          direction: "rtl",
          textAlign: "right",
          color: C.text,
          boxSizing: "border-box",
        }}
      >
        {/* Accent Bar */}
        <div
          style={{
            height: "7px",
            background: isDebit
              ? `linear-gradient(90deg, ${C.darkNavy} 0%, ${C.amber} 50%, ${C.red} 100%)`
              : `linear-gradient(90deg, ${C.darkNavy} 0%, ${C.emerald} 50%, ${C.orange} 100%)`,
          }}
        />

        {/* Header */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-5"
          style={{
            borderBottom: `2px solid ${C.border}`,
            background: "#ffffff",
          }}
        >
          {/* Logo & Company Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                backgroundColor: C.white,
                borderRadius: "12px",
                padding: "3px",
                border: `2px solid ${isDebit ? C.amber : C.emerald}`,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
              }}
            >
              <img
                src={LOGO_BASE64}
                alt="شركة النسر"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div>
              <div style={{ fontSize: "1.35rem", fontWeight: 900, color: C.darkNavy, lineHeight: 1.15 }}>
                شركة النسر
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: isDebit ? C.amber : C.emerald, marginTop: "3px" }}>
                للأدوات واللوحات الكهربائية
              </div>
              <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: "2px" }}>
                تجارة وتوزيع الجملة ▪ {isDebit ? "سند صرف سلفة نقدية" : "سند تسوية حساب"}
              </div>
            </div>
          </div>

          {/* Receipt Badge */}
          <div>
            <div
              style={{
                display: "inline-block",
                background: isDebit
                  ? `linear-gradient(135deg, #b45309, #d97706)`
                  : `linear-gradient(135deg, ${C.darkEmerald}, ${C.emerald})`,
                color: C.white,
                padding: "5px 16px",
                borderRadius: "20px",
                fontSize: "0.88rem",
                fontWeight: 900,
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
            >
              {isDebit ? "إيصال سلفة نقدية 💸" : "إيصال تسوية حساب 📝"}
            </div>
            <div style={{ fontSize: "0.85rem", marginTop: "6px", color: C.text }}>
              <span style={{ color: C.muted }}>التاريخ: </span>
              <strong style={{ color: C.darkNavy }}>{formatDate(adjDate)}</strong>
            </div>
            {adjustment.treasury && (
              <div style={{ fontSize: "0.8rem", marginTop: "2px", color: C.muted }}>
                <span>الخزينة المنصرف منها: </span>
                <strong style={{ color: C.text }}>{adjustment.treasury.name}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Customer Info Box */}
        <div style={{ padding: "1rem 1.3rem" }} className="space-y-3">
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            style={{
              backgroundColor: "#f8fafc",
              border: `1.5px solid ${C.border}`,
              borderRadius: "10px",
              padding: "0.85rem 1.1rem",
              fontSize: "0.88rem",
            }}
          >
            <div>
              <span style={{ color: C.muted, fontSize: "0.8rem", fontWeight: 600, display: "block" }}>العميل المكرم:</span>
              <strong style={{ fontSize: "1.15rem", color: C.darkNavy, fontWeight: 900 }}>{adjustment.customer.name}</strong>
              {adjustment.customer.phone && (
                <div style={{ color: C.muted, fontSize: "0.82rem", marginTop: "2px" }}>
                  📞 <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{adjustment.customer.phone}</span>
                </div>
              )}
            </div>

            <div style={{ textAlign: "left" }}>
              <span style={{ color: C.muted, fontSize: "0.8rem", fontWeight: 600, display: "block" }}>نوع المعاملة:</span>
              <div style={{ fontWeight: 800, color: isDebit ? C.red : C.emerald, fontSize: "0.95rem" }}>
                {isDebit ? "سلفة نقدية / إضافة على الحساب" : "خصم وتسوية من الحساب"}
              </div>
              {creatorName && (
                <div style={{ color: C.muted, fontSize: "0.78rem", marginTop: "2px" }}>
                  المسؤول: {creatorName}
                </div>
              )}
            </div>
          </div>

          {adjustment.notes && (
            <div
              style={{
                marginTop: "0.65rem",
                backgroundColor: isDebit ? "#fffbeb" : "#eff6ff",
                border: `1px solid ${isDebit ? "#fde68a" : "#bfdbfe"}`,
                borderRadius: "8px",
                padding: "0.5rem 0.85rem",
                fontSize: "0.85rem",
                color: isDebit ? "#92400e" : "#1e40af",
              }}
            >
              <strong style={{ fontWeight: 800 }}>البيان / سبب السلفة: </strong>
              <span>{adjustment.notes}</span>
            </div>
          )}
        </div>

        {/* FINANCIAL BREAKDOWN BOX */}
        <div style={{ padding: "0.5rem 1.3rem 1.25rem 1.3rem" }}>
          <div
            style={{
              borderRadius: "12px",
              border: `2px solid ${isDebit ? C.amber : C.darkEmerald}`,
              backgroundColor: "#ffffff",
              overflow: "hidden",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            }}
          >
            {/* Box Header */}
            <div
              style={{
                backgroundColor: C.darkNavy,
                color: C.white,
                padding: "8px 14px",
                fontSize: "0.92rem",
                fontWeight: 900,
                textAlign: "center",
              }}
            >
              📊 ملخص الحساب والسلفة الحالية
            </div>

            {/* Column Headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1.1fr 1.3fr",
                textAlign: "center",
                borderBottom: `1.5px solid ${C.border}`,
                backgroundColor: "#f1f5f9",
                padding: "8px 0",
                fontWeight: 800,
                fontSize: "0.88rem",
                color: C.text,
              }}
            >
              <div>الحساب السابق</div>
              <div style={{ color: isDebit ? C.red : C.darkEmerald, fontWeight: 900 }}>
                {isDebit ? "مبلغ السلفة (+)" : "مبلغ التسوية (-)"}
              </div>
              <div style={{ color: C.darkNavy, fontWeight: 900 }}>= الرصيد النهائي المطلوب</div>
            </div>

            {/* Values Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1.1fr 1.3fr",
                textAlign: "center",
                alignItems: "center",
                padding: "14px 0",
                fontFamily: "monospace",
              }}
            >
              {/* الحساب السابق */}
              <div style={{ padding: "0 6px" }}>
                <div
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 900,
                    color: prevBalance > 0 ? C.red : prevBalance < 0 ? C.darkEmerald : C.muted,
                  }}
                >
                  {formatEGP(prevBalance)} ج
                </div>
                <div style={{ fontSize: "0.72rem", color: C.muted, fontWeight: 700, fontFamily: "sans-serif", marginTop: "3px" }}>
                  {prevBalance > 0 ? "مديونية سابقة" : prevBalance < 0 ? "رصيد دائن" : "خالص"}
                </div>
              </div>

              {/* السلفة / الحركة */}
              <div
                style={{
                  padding: "6px",
                  backgroundColor: isDebit ? "#fff7ed" : "#ecfdf5",
                  borderRadius: "8px",
                  margin: "0 4px",
                  border: `1px solid ${isDebit ? C.amber : C.emerald}`,
                }}
              >
                <div style={{ fontSize: "1.35rem", fontWeight: 900, color: isDebit ? "#c2410c" : C.darkEmerald }}>
                  {isDebit ? `+ ${formatEGP(adjAmount)}` : `- ${formatEGP(adjAmount)}`} ج
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: isDebit ? "#9a3412" : C.darkEmerald,
                    fontWeight: 800,
                    fontFamily: "sans-serif",
                    marginTop: "3px",
                  }}
                >
                  {isDebit ? "تم صرف السلفة 💸" : "تم الخصم والتسوية"}
                </div>
              </div>

              {/* الرصيد الجديد */}
              <div
                style={{
                  padding: "6px 8px",
                  backgroundColor: newBalance > 0 ? "#fff1f2" : newBalance < 0 ? "#f0fdf4" : "#f8fafc",
                  borderRadius: "8px",
                  margin: "0 6px",
                  border: `2px solid ${newBalance > 0 ? "#fca5a5" : newBalance < 0 ? "#86efac" : C.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: "1.55rem",
                    fontWeight: 900,
                    color: newBalance > 0 ? C.red : newBalance < 0 ? C.darkEmerald : C.darkNavy,
                  }}
                >
                  {formatEGP(newBalance)} ج
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 900,
                    color: newBalance > 0 ? C.red : newBalance < 0 ? C.darkEmerald : C.darkNavy,
                    fontFamily: "sans-serif",
                    marginTop: "3px",
                  }}
                >
                  {newBalance > 0 ? "المطلوب سداده بعد السلفة ⚠️" : newBalance < 0 ? "رصيد دائن لصالح العميل ✨" : "الحساب خالص بالكامل 🎉"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            padding: "0.85rem 1.3rem",
            borderTop: `1.5px solid ${C.border}`,
            textAlign: "center",
            fontSize: "0.82rem",
            color: "#475569",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 800, color: C.darkNavy, marginBottom: "3px", fontSize: "0.88rem" }}>
            شركة النسر للأدوات واللوحات الكهربائية • تجارة وتوزيع الجملة
          </div>
          <div style={{ fontWeight: 600, color: C.muted, fontSize: "0.78rem" }}>
            سند رسمي ومسجل بالمنظومة ▪ للإدارة واستفسارات الحسابات يرجى التواصل عبر الواتساب أو الهاتف
          </div>
        </div>
      </div>
    </div>
  );
}
