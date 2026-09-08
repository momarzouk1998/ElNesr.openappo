import { prisma } from '@/lib/db/prisma-direct';
import { notFound } from 'next/navigation';
import { formatEGP, formatDate } from '@/lib/format';
import PrintActions from './PrintActions';
import { LOGO_BASE64 } from '@/lib/logo-base64';

export const dynamic = 'force-dynamic';

const C = {
  navy: '#0f4185',
  darkNavy: '#002b61',
  orange: '#f7941d',
  darkOrange: '#d97706',
  dark: '#0f172a',
  lightBg: '#f8fafc',
  border: '#cbd5e1',
  borderDark: '#94a3b8',
  text: '#0f172a',
  muted: '#475569',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#d97706',
  yellowBg: '#fef3c7',
  white: '#ffffff',
  tableHeader: '#002b61',
  rowAlt: '#f8fafc',
};

export default async function InvoicePrintPage({
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

  const invoice = await prisma.sales_invoices.findUnique({
    where: { id },
    include: {
      customer: true,
      store: true,
      items: { include: { product: { select: { name: true } } } },
      creator: { select: { full_name: true } },
    },
  });
  if (!invoice) notFound();

  const isTax = invoice.invoice_type === 'ضريبية';
  const isCancelled = invoice.status === 'ملغاة';
  const hasCustomer = !!invoice.customer;

  // 1. حساب المدفوع المرتبط بالفاتورة
  let paidOnDate = 0;
  if (hasCustomer && invoice.customer) {
    const linkedPayments = await prisma.customer_payments.findMany({
      where: { invoice_id: invoice.id },
      select: { amount: true },
    });
    paidOnDate = linkedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    if (paidOnDate === 0) {
      paidOnDate = Number(invoice.paid_amount || 0);
    }
  }

  let prevBalance: number | null = null;
  let newBalance: number | null = null;

  if (hasCustomer && invoice.customer) {
    if (
      invoice.customer_prev_balance !== null &&
      invoice.customer_prev_balance !== undefined
    ) {
      prevBalance = Number(invoice.customer_prev_balance);
      newBalance = isCancelled
        ? prevBalance
        : prevBalance + (Number(invoice.total) - paidOnDate);
    } else {
      const custId = invoice.customer.id;
      const invDate = invoice.created_at || invoice.invoice_date;
      const opening = Number(invoice.customer.opening_balance || 0);

      const priorInvoices = await prisma.sales_invoices.findMany({
        where: {
          customer_id: custId,
          status: 'مكتملة',
          invoice_number: { lt: invoice.invoice_number },
        },
        select: { total: true },
      });
      const priorInvoicesTotal = priorInvoices.reduce(
        (sum, inv) => sum + Number(inv.total),
        0
      );

      const priorPayments = await prisma.customer_payments.findMany({
        where: {
          customer_id: custId,
          OR: [
            { invoice_id: null, created_at: { lt: invDate } },
            {
              invoice: {
                invoice_number: { lt: invoice.invoice_number },
              },
            },
          ],
        },
        select: { amount: true },
      });
      const priorPaymentsTotal = priorPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      const priorReturns = await prisma.customer_return_invoices.findMany({
        where: {
          customer_id: custId,
          status: { not: 'ملغاة' },
          created_at: { lte: invDate },
        },
        select: { total_amount: true },
      });
      const priorReturnsTotal = priorReturns.reduce(
        (sum, r) => sum + Number(r.total_amount),
        0
      );

      prevBalance = opening + priorInvoicesTotal - priorPaymentsTotal - priorReturnsTotal;

      if (isCancelled) {
        newBalance = prevBalance;
      } else {
        newBalance = prevBalance + (Number(invoice.total) - paidOnDate);
      }
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#e2e8f0', padding: '1rem 0.5rem', fontFamily: "'Cairo', 'Segoe UI', Tahoma, sans-serif" }}>
      <div
        id="statement"
        className="print-page"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: C.white,
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          border: `1.5px solid ${C.borderDark}`,
          direction: 'rtl',
          textAlign: 'right',
          color: C.text,
          boxSizing: 'border-box',
        }}
      >
        {/* Top Accent Line */}
        <div style={{ height: '6px', background: `linear-gradient(90deg, ${C.darkNavy} 0%, ${C.navy} 60%, ${C.orange} 100%)` }} />

        {/* High-Contrast Integrated Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `2px solid ${C.border}`,
            background: '#ffffff',
          }}
        >
          {/* Logo & Company Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '68px',
                height: '68px',
                backgroundColor: C.white,
                borderRadius: '10px',
                padding: '3px',
                border: `2px solid ${C.orange}`,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <img
                src={LOGO_BASE64}
                alt="شركة النسر"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: C.darkNavy, lineHeight: 1.15 }}>
                شركة النسر
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: C.orange, marginTop: '3px' }}>
                للأدوات واللوحات الكهربائية
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: '2px' }}>
                تجارة وتوزيع الجملة
              </div>
            </div>
          </div>

          {/* Invoice Meta & Status */}
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                display: 'inline-block',
                background: isCancelled ? C.red : C.darkNavy,
                color: C.white,
                padding: '4px 14px',
                borderRadius: '20px',
                fontSize: '0.9rem',
                fontWeight: 800,
              }}
            >
              {isCancelled ? 'فاتورة ملغاة 🚫' : `فاتورة ${invoice.invoice_type}`}
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '6px', color: C.text }}>
              <span style={{ color: C.muted }}>رقم الفاتورة: </span>
              <strong style={{ fontFamily: 'monospace', fontSize: '1rem', color: C.darkNavy }}>#{invoice.invoice_number}</strong>
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: '2px', color: C.muted }}>
              <span>التاريخ: </span>
              <strong style={{ color: C.text }}>{formatDate(invoice.invoice_date)}</strong>
            </div>
          </div>
        </div>

        {/* Customer & Warehouse Info Bar */}
        <div
          style={{
            backgroundColor: '#f1f5f9',
            borderBottom: `2px solid ${C.border}`,
            padding: '0.65rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.9rem',
          }}
        >
          {invoice.customer ? (
            <div>
              <span style={{ color: C.muted }}>العميل المكرم: </span>
              <strong style={{ fontSize: '1.05rem', color: C.darkNavy, fontWeight: 900 }}>{invoice.customer.name}</strong>
              {invoice.customer.phone && (
                <span style={{ color: C.muted, marginRight: '10px', fontSize: '0.85rem' }}>📞 {invoice.customer.phone}</span>
              )}
            </div>
          ) : (
            <div>
              <span style={{ color: C.muted }}>العميل: </span>
              <strong style={{ fontSize: '1rem', color: C.darkNavy }}>عميل نقدي</strong>
            </div>
          )}

          {invoice.store && (
            <div style={{ color: C.muted, fontSize: '0.85rem' }}>
              <span>المخزن: </span>
              <strong style={{ color: C.dark }}>{invoice.store.name}</strong>
            </div>
          )}
        </div>

        {/* Items Table with Extra Large & Sharp Typography */}
        <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: C.tableHeader, color: C.white, borderBottom: `2px solid ${C.orange}` }}>
              <th style={{ padding: '8px 10px', textAlign: 'center', width: '36px', fontSize: '0.85rem' }}>م</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.9rem' }}>الصنف والبيان</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', width: '55px', fontSize: '0.85rem' }}>الكمية</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', width: '85px', fontSize: '0.85rem' }}>السعر</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', width: '100px', fontSize: '0.85rem' }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr
                key={it.id}
                style={{
                  backgroundColor: i % 2 === 0 ? C.rowAlt : C.white,
                  borderBottom: `1px solid #e2e8f0`,
                }}
              >
                <td style={{ padding: '8px 10px', textAlign: 'center', color: C.muted, fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '8px 10px', fontWeight: 800, color: C.text, fontSize: '0.95rem' }}>{it.product_name}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: '1rem', color: C.darkNavy }}>
                  {Number(it.quantity)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'left', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem' }}>
                  {formatEGP(Number(it.unit_price))}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'left', fontFamily: 'monospace', fontWeight: 900, fontSize: '1.05rem', color: C.navy }}>
                  {formatEGP(Number(it.line_total))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Financial Summary & Totals */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: `2px solid ${C.navy}`,
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginBottom: '4px' }}>
            <span style={{ color: C.muted, fontWeight: 600 }}>الإجمالي قبل الخصم:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1rem' }}>
              {formatEGP(Number(invoice.subtotal))} ج
            </span>
          </div>

          {Number(invoice.discount) > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.9rem',
                color: C.yellow,
                backgroundColor: C.yellowBg,
                padding: '3px 10px',
                borderRadius: '6px',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontWeight: 700 }}>الخصم:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1rem' }}>
                - {formatEGP(Number(invoice.discount))} ج
              </span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '1.35rem',
              fontWeight: 900,
              borderTop: `2px dashed ${C.border}`,
              paddingTop: '6px',
              color: C.darkNavy,
            }}
          >
            <span>إجمالي الفاتورة الحالية:</span>
            <span style={{ fontFamily: 'monospace', color: C.darkNavy, fontSize: '1.45rem' }}>{formatEGP(Number(invoice.total))} ج</span>
          </div>
        </div>

        {/* Customer Account Statement Box (Large, High Contrast for WhatsApp) */}
        {hasCustomer && prevBalance !== null && newBalance !== null && (
          <div
            style={{
              margin: '0.5rem 1.25rem 0.85rem 1.25rem',
              borderRadius: '10px',
              border: `2px solid ${isCancelled ? '#fca5a5' : C.navy}`,
              backgroundColor: isCancelled ? '#fff1f2' : '#f8fafc',
              overflow: 'hidden',
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
            }}
          >
            {isCancelled && (
              <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid #fca5a5' }}>
                🚫 تنبيه: هذه الفاتورة ملغاة ولا تؤثر على كشف حساب العميل
              </div>
            )}
            
            <div
              style={{
                backgroundColor: C.darkNavy,
                color: C.white,
                padding: '5px 12px',
                fontSize: '0.85rem',
                fontWeight: 800,
                textAlign: 'center',
              }}
            >
              📑 كشف حساب العميل مدمج بالفاتورة
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isCancelled ? '1fr 1fr' : paidOnDate > 0 ? '1fr 1fr 1fr 1.2fr' : '1fr 1fr 1.2fr',
                textAlign: 'center',
                borderBottom: `1px solid ${C.border}`,
                backgroundColor: '#edf2f7',
                padding: '6px 0',
                fontWeight: 800,
                fontSize: '0.85rem',
                color: C.text,
              }}
            >
              <div>الحساب السابق</div>
              {!isCancelled && <div>+ الفاتورة الحالية</div>}
              {!isCancelled && paidOnDate > 0 && <div style={{ color: C.green }}>- المدفوع</div>}
              <div style={{ color: C.darkNavy, fontWeight: 900 }}>{isCancelled ? 'رصيد العميل' : '= المتبقي النهائي'}</div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isCancelled ? '1fr 1fr' : paidOnDate > 0 ? '1fr 1fr 1fr 1.2fr' : '1fr 1fr 1.2fr',
                textAlign: 'center',
                padding: '8px 0',
                fontFamily: 'monospace',
                fontWeight: 900,
              }}
            >
              <div style={{ color: prevBalance > 0.01 ? C.red : prevBalance < -0.01 ? C.green : C.muted, fontSize: '1.05rem' }}>
                {formatEGP(prevBalance)} ج
              </div>
              {!isCancelled && (
                <div style={{ color: C.darkOrange, fontSize: '1.05rem' }}>
                  +{formatEGP(Number(invoice.total))} ج
                </div>
              )}
              {!isCancelled && paidOnDate > 0 && (
                <div style={{ color: C.green, fontSize: '1.05rem' }}>
                  -{formatEGP(paidOnDate)} ج
                </div>
              )}
              <div style={{ color: newBalance > 0.01 ? C.red : newBalance < -0.01 ? C.green : C.darkNavy, fontSize: '1.25rem', backgroundColor: '#f1f5f9', padding: '2px 0' }}>
                {formatEGP(newBalance)} ج
              </div>
            </div>
          </div>
        )}

        {/* Elegant Footer */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            padding: '0.75rem 1.25rem',
            borderTop: `1.5px solid ${C.border}`,
            textAlign: 'center',
            fontSize: '0.8rem',
            color: '#475569',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 800, color: C.darkNavy, marginBottom: '3px', fontSize: '0.85rem' }}>
            شركة النسر للأدوات واللوحات الكهربائية • تجارة وتوزيع الجملة
          </div>
          <div style={{ fontWeight: 600, color: C.muted, fontSize: '0.78rem' }}>
            شكراً لتعاملكم معنا • للإدارة والاستفسارات يرجى التواصل عبر الواتساب أو الهاتف
          </div>
        </div>
      </div>

      <PrintActions
        autoprint={autoprint}
        downloadImage={downloadImage}
        downloadPdf={downloadPdf}
        fileName={`فاتورة شركة النسر - ${invoice.invoice_number}`}
        targetId="statement"
        invoiceId={invoice.id}
        customerId={invoice.customer?.id}
        customerName={invoice.customer?.name}
        isCancelled={isCancelled}
      />
    </div>
  );
}
