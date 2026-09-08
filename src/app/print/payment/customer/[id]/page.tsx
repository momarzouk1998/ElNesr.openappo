import { prisma } from '@/lib/db/prisma-direct';
import { notFound } from 'next/navigation';
import { formatEGP, formatDate } from '@/lib/format';
import PrintActions from '@/app/print/invoice/[id]/PrintActions';
import { LOGO_BASE64 } from '@/lib/logo-base64';

export const dynamic = 'force-dynamic';

const C = {
  navy: '#0f4185',
  darkNavy: '#002b61',
  orange: '#f7941d',
  emerald: '#059669',
  darkEmerald: '#047857',
  lightBg: '#f8fafc',
  border: '#cbd5e1',
  borderDark: '#94a3b8',
  text: '#0f172a',
  muted: '#475569',
  red: '#dc2626',
  white: '#ffffff',
} as const;

export default async function CustomerPaymentReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string; download_image?: string; download_pdf?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const autoprint = sp.autoprint === '1';
  const downloadImage = sp.download_image === '1';
  const downloadPdf = sp.download_pdf === '1';

  const payment = await prisma.customer_payments.findUnique({
    where: { id },
    include: {
      customer: true,
      treasury: true,
      creator: { select: { full_name: true } },
      invoice: { select: { invoice_number: true, total: true } },
    },
  });

  if (!payment || !payment.customer) notFound();

  const customerId = payment.customer.id;
  const payDate = payment.payment_date || payment.created_at || new Date();
  const payCreatedAt = payment.created_at || payDate;
  const opening = Number(payment.customer.opening_balance || 0);

  // حساب الفواتير والمدفوعات والمرتجعات السابقة لهذا السند لحساب "الحساب السابق"
  const priorInvoices = await prisma.sales_invoices.findMany({
    where: {
      customer_id: customerId,
      status: { not: 'ملغاة' },
      created_at: { lt: payCreatedAt },
    },
    select: { total: true },
  });
  const priorInvoicesTotal = priorInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);

  const priorPayments = await prisma.customer_payments.findMany({
    where: {
      customer_id: customerId,
      id: { not: payment.id },
      created_at: { lt: payCreatedAt },
    },
    select: { amount: true },
  });
  const priorPaymentsTotal = priorPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  const priorReturns = await prisma.customer_return_invoices.findMany({
    where: {
      customer_id: customerId,
      status: { not: 'ملغاة' },
      created_at: { lt: payCreatedAt },
    },
    select: { total_amount: true },
  });
  const priorReturnsTotal = priorReturns.reduce((sum, r) => sum + Number(r.total_amount), 0);

  const prevBalance = opening + priorInvoicesTotal - priorPaymentsTotal - priorReturnsTotal;
  const paidAmount = Number(payment.amount);
  const newBalance = prevBalance - paidAmount;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#e2e8f0', padding: '1rem 0.5rem', fontFamily: "'Cairo', 'Segoe UI', Tahoma, sans-serif" }}>
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
        fileName={`إيصال_تحصيل_${payment.customer.name}_${formatDate(payDate)}`}
        targetId="statement"
        customerId={payment.customer.id}
        customerName={payment.customer.name}
        customerPhone={payment.customer.phone}
        title="إيصال تحصيل نقدية"
        backLink={`/customers/${payment.customer.id}`}
        backLabel="↩️ العودة لصفحة العميل"
      />

      <div
        id="statement"
        className="print-page"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: C.white,
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 10px 32px rgba(0,0,0,0.12)',
          border: `1.5px solid ${C.borderDark}`,
          direction: 'rtl',
          textAlign: 'right',
          color: C.text,
          boxSizing: 'border-box',
        }}
      >
        {/* Top Gradient Accent Bar */}
        <div style={{ height: '7px', background: `linear-gradient(90deg, ${C.darkNavy} 0%, ${C.emerald} 50%, ${C.orange} 100%)` }} />

        {/* Integrated High-Contrast Header */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-5"
          style={{
            borderBottom: `2px solid ${C.border}`,
            background: '#ffffff',
          }}
        >
          {/* Logo & Company Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                backgroundColor: C.white,
                borderRadius: '12px',
                padding: '3px',
                border: `2px solid ${C.emerald}`,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
              }}
            >
              <img
                src={LOGO_BASE64}
                alt="شركة النسر"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: C.darkNavy, lineHeight: 1.15 }}>
                شركة النسر
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: C.emerald, marginTop: '3px' }}>
                للأدوات واللوحات الكهربائية
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: '2px' }}>
                تجارة وتوزيع الجملة ▪ سند استلام مبلغ
              </div>
            </div>
          </div>

          {/* Receipt Badge & Meta */}
          <div>
            <div
              style={{
                display: 'inline-block',
                background: `linear-gradient(135deg, ${C.darkEmerald}, ${C.emerald})`,
                color: C.white,
                padding: '5px 16px',
                borderRadius: '20px',
                fontSize: '0.88rem',
                fontWeight: 900,
                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
              }}
            >
              إيصال تحصيل نقدية 💳
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '6px', color: C.text }}>
              <span style={{ color: C.muted }}>التاريخ: </span>
              <strong style={{ color: C.darkNavy }}>{formatDate(payDate)}</strong>
            </div>
            {payment.treasury && (
              <div style={{ fontSize: '0.8rem', marginTop: '2px', color: C.muted }}>
                <span>الخزينة: </span>
                <strong style={{ color: C.text }}>{payment.treasury.name}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Customer Info & Payment Details Box */}
        <div style={{ padding: '1rem 1.3rem' }} className="space-y-3">
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            style={{
              backgroundColor: '#f8fafc',
              border: `1.5px solid ${C.border}`,
              borderRadius: '10px',
              padding: '0.85rem 1.1rem',
              fontSize: '0.88rem',
            }}
          >
            <div>
              <span style={{ color: C.muted, fontSize: '0.8rem', fontWeight: 600, display: 'block' }}>العميل المكرم:</span>
              <strong style={{ fontSize: '1.15rem', color: C.darkNavy, fontWeight: 900 }}>{payment.customer.name}</strong>
              {payment.customer.phone && (
                <div style={{ color: C.muted, fontSize: '0.82rem', marginTop: '2px' }}>
                  📞 <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{payment.customer.phone}</span>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'left' }}>
              <span style={{ color: C.muted, fontSize: '0.8rem', fontWeight: 600, display: 'block' }}>طريقة الدفع والبيان:</span>
              <div style={{ fontWeight: 800, color: C.darkNavy, fontSize: '0.95rem' }}>
                {payment.payment_method}
              </div>
              {payment.creator?.full_name && (
                <div style={{ color: C.muted, fontSize: '0.78rem', marginTop: '2px' }}>
                  المحصل: {payment.creator.full_name}
                </div>
              )}
            </div>
          </div>

          {payment.notes && (
            <div
              style={{
                marginTop: '0.65rem',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '0.5rem 0.85rem',
                fontSize: '0.85rem',
                color: '#1e40af',
              }}
            >
              <strong style={{ fontWeight: 800 }}>البيان / الملاحظات: </strong>
              <span>{payment.notes}</span>
              {payment.invoice && (
                <span style={{ fontWeight: 700, marginRight: '6px', color: C.navy }}>
                  (مرتبط بالفاتورة #{payment.invoice.invoice_number})
                </span>
              )}
            </div>
          )}
        </div>

        {/* FINANCIAL BREAKDOWN BOX IN EXTRA LARGE BOLD FONTS */}
        <div style={{ padding: '0.5rem 1.3rem 1.25rem 1.3rem' }}>
          <div
            style={{
              borderRadius: '12px',
              border: `2px solid ${C.darkEmerald}`,
              backgroundColor: '#ffffff',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            }}
          >
            {/* Box Header */}
            <div
              style={{
                backgroundColor: C.darkNavy,
                color: C.white,
                padding: '8px 14px',
                fontSize: '0.92rem',
                fontWeight: 900,
                textAlign: 'center',
                letterSpacing: '0.3px',
              }}
            >
              📊 ملخص الحساب والتحصيل الحالي
            </div>

            {/* Column Headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.1fr 1.1fr 1.3fr',
                textAlign: 'center',
                borderBottom: `1.5px solid ${C.border}`,
                backgroundColor: '#f1f5f9',
                padding: '8px 0',
                fontWeight: 800,
                fontSize: '0.88rem',
                color: C.text,
              }}
            >
              <div>الحساب السابق</div>
              <div style={{ color: C.darkEmerald, fontWeight: 900 }}>الدفعة / التحصيل</div>
              <div style={{ color: C.darkNavy, fontWeight: 900 }}>= المتبقي النهائي</div>
            </div>

            {/* Values Row in Very Large Sharp Typography */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.1fr 1.1fr 1.3fr',
                textAlign: 'center',
                alignItems: 'center',
                padding: '14px 0',
                fontFamily: 'monospace',
              }}
            >
              {/* الحساب السابق */}
              <div style={{ padding: '0 6px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: prevBalance > 0 ? C.red : prevBalance < 0 ? C.darkEmerald : C.muted }}>
                  {formatEGP(prevBalance)} ج
                </div>
                <div style={{ fontSize: '0.72rem', color: C.muted, fontWeight: 700, fontFamily: 'sans-serif', marginTop: '3px' }}>
                  {prevBalance > 0 ? 'مديونية متراكمة' : prevBalance < 0 ? 'رصيد دائن' : 'خالص'}
                </div>
              </div>

              {/* التحصيل / الدفع */}
              <div
                style={{
                  padding: '6px',
                  backgroundColor: '#ecfdf5',
                  borderRadius: '8px',
                  margin: '0 4px',
                  border: `1px solid ${C.emerald}`,
                }}
              >
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: C.darkEmerald }}>
                  - {formatEGP(paidAmount)} ج
                </div>
                <div style={{ fontSize: '0.72rem', color: C.darkEmerald, fontWeight: 800, fontFamily: 'sans-serif', marginTop: '3px' }}>
                  تم المستلم بنجاح ✅
                </div>
              </div>

              {/* المتبقي النهائي */}
              <div
                style={{
                  padding: '6px 8px',
                  backgroundColor: newBalance > 0 ? '#fff1f2' : newBalance < 0 ? '#f0fdf4' : '#f8fafc',
                  borderRadius: '8px',
                  margin: '0 6px',
                  border: `2px solid ${newBalance > 0 ? '#fca5a5' : newBalance < 0 ? '#86efac' : C.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: '1.55rem',
                    fontWeight: 900,
                    color: newBalance > 0 ? C.red : newBalance < 0 ? C.darkEmerald : C.darkNavy,
                  }}
                >
                  {formatEGP(newBalance)} ج
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    color: newBalance > 0 ? C.red : newBalance < 0 ? C.darkEmerald : C.darkNavy,
                    fontFamily: 'sans-serif',
                    marginTop: '3px',
                  }}
                >
                  {newBalance > 0 ? 'متبقي مستحق للتحصيل ⚠️' : newBalance < 0 ? 'رصيد دائن لصالح العميل ✨' : 'الحساب خالص بالكامل 🎉'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Elegant Footer */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            padding: '0.85rem 1.3rem',
            borderTop: `1.5px solid ${C.border}`,
            textAlign: 'center',
            fontSize: '0.82rem',
            color: '#475569',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 800, color: C.darkNavy, marginBottom: '3px', fontSize: '0.88rem' }}>
            شركة النسر للأدوات واللوحات الكهربائية • تجارة وتوزيع الجملة
          </div>
          <div style={{ fontWeight: 600, color: C.muted, fontSize: '0.78rem' }}>
            شكراً لتعاملكم معنا ▪ للإدارة واستفسارات المبيعات يرجى التواصل عبر الواتساب أو الهاتف
          </div>
        </div>
      </div>
    </div>
  );
}
