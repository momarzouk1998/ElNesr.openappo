import { prisma } from '@/lib/db/prisma-direct';
import { formatEGP, formatDate } from '@/lib/format';
import PrintActions from '@/app/print/invoice/[id]/PrintActions';
import { LOGO_BASE64 } from '@/lib/logo-base64';

export const dynamic = 'force-dynamic';

const C = {
  orange: '#0284c7',
  darkOrange: '#0369a1',
  gray: '#002b61',
  text: '#343a40',
  lightBg: '#f8f9fa',
  border: '#dee2e6',
  success: '#28a745',
  danger: '#dc3545',
  white: '#ffffff',
  muted: '#6c757d',
} as const;

export default async function AllCustomersStatementPage() {
  const customers = await prisma.customers.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      balance: true,
      opening_balance: true,
      sales_invoices: {
        where: { status: { not: 'ملغاة' } },
        select: { total: true },
      },
      payments: {
        select: { amount: true },
      },
      return_invoices: {
        where: { status: { not: 'ملغاة' } },
        select: { total_amount: true },
      },
    },
  });

  const rows = customers.map(c => {
    const totalInvoices = c.sales_invoices.reduce((s, inv) => s + Number(inv.total), 0);
    const totalPayments = c.payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalReturns = c.return_invoices.reduce((s, r) => s + Number(r.total_amount), 0);
    const netBalance = Number(c.balance);
    const statusLabel = netBalance > 0 ? 'مديون' : netBalance < 0 ? 'رصيد دائن' : 'خالص';

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      totalInvoices,
      totalPayments,
      totalReturns,
      netBalance,
      statusLabel,
    };
  });

  const grandTotalInvoices = rows.reduce((s, r) => s + r.totalInvoices, 0);
  const grandTotalPayments = rows.reduce((s, r) => s + r.totalPayments, 0);
  const grandTotalReturns = rows.reduce((s, r) => s + r.totalReturns, 0);
  const grandBalance = rows.reduce((s, r) => s + r.netBalance, 0);
  const customersWithDebt = rows.filter(r => r.netBalance > 0).length;
  const customersSettled = rows.filter(r => r.netBalance === 0).length;

  const n = (v: number) => formatEGP(v);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '1rem', fontFamily: "'Cairo', 'Segoe UI', sans-serif", direction: 'rtl' }}>
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
          table {
            width: 100% !important;
            table-layout: fixed !important;
          }
          th, td {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <PrintActions
        backLink="/customers"
        backLabel="↩️ العودة للعملاء"
        fileName="كشف حساب مجمع - كل العملاء"
        targetId="statement"
        title="كشف حساب مجمع للعملاء"
      />

      <div className="w-full overflow-x-auto pb-4 flex justify-center">
      <div id="statement" style={{
        minWidth: '700px', maxWidth: '800px', width: '100%', margin: '0 auto', background: C.white,
        borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        overflow: 'hidden', border: `1px solid ${C.border}`, fontFamily: "'Cairo', 'Segoe UI', sans-serif",
        direction: 'rtl', textAlign: 'right', color: C.text, boxSizing: 'border-box',
      }}>

        {/* Top accent bar */}
        <div style={{ height: '4px', width: '100%', background: `linear-gradient(90deg, ${C.orange} 0%, ${C.darkOrange} 50%, ${C.gray} 100%)` }} />

        {/* Header */}
        <div style={{
          padding: '1.2rem 1.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: C.white, borderBottom: `2px solid ${C.gray}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              backgroundColor: C.white, borderRadius: '12px', padding: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: `2px solid ${C.orange}`,
              width: '60px', height: '60px',
            }}>
              <img src={LOGO_BASE64} alt="شركة النسر" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: C.gray, lineHeight: 1.2 }}>شركة النسر</div>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontWeight: 400 }}>للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة</div>
            </div>
          </div>

          <div style={{ textAlign: 'left' }}>
            <div style={{
              display: 'inline-block', background: `linear-gradient(90deg, #001a3a 0%, #0284c7 100%)`,
              color: C.white, padding: '5px 18px', borderRadius: '20px',
              fontSize: '0.85rem', fontWeight: 800, boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
            }}>
              كشف مجمع — كل العملاء
            </div>
            <div style={{ fontSize: '0.8rem', color: C.muted, fontWeight: 700, marginTop: '6px' }}>
              تاريخ الاستخراج: {formatDate(new Date())}
            </div>
          </div>
        </div>

        <div style={{ padding: '1.5rem 1.8rem' }}>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '1.5rem' }}>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.orange}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>عدد العملاء</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: C.orange }}>{rows.length}</div>
            </div>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.danger}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>عملاء مدينون</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: C.danger }}>{customersWithDebt}</div>
            </div>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.success}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>عملاء خالصون</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: C.success }}>{customersSettled}</div>
            </div>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.gray}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>إجمالي المرتجعات</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.gray }}>{n(grandTotalReturns)}</div>
            </div>
          </div>

          {/* Customers table */}
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ backgroundColor: C.gray, color: C.white }}>
                <th style={{ padding: '8px 4px', textAlign: 'center', border: `1px solid ${C.border}`, width: '6%' }}>#</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', border: `1px solid ${C.border}`, width: '38%' }}>اسم العميل</th>
                <th style={{ padding: '8px 4px', textAlign: 'center', border: `1px solid ${C.border}`, width: '14%' }}>حالة الحساب</th>
                <th style={{ padding: '8px 4px', textAlign: 'center', border: `1px solid ${C.border}`, width: '14%' }}>إجمالي الفواتير</th>
                <th style={{ padding: '8px 4px', textAlign: 'center', border: `1px solid ${C.border}`, width: '14%' }}>إجمالي المدفوعات</th>
                <th style={{ padding: '8px 4px', textAlign: 'center', border: `1px solid ${C.border}`, width: '14%' }}>صافي الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const textColor = r.netBalance > 0 ? C.danger : r.netBalance < 0 ? C.success : C.muted;
                return (
                  <tr key={r.id} style={{ backgroundColor: i % 2 === 0 ? C.white : C.lightBg }}>
                    <td style={{ padding: '7px 4px', textAlign: 'center', border: `1px solid ${C.border}` }}>{i + 1}</td>
                    <td style={{ padding: '7px 6px', fontWeight: 700, border: `1px solid ${C.border}`, wordBreak: 'break-word' }}>{r.name}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: textColor }}>
                        {r.statusLabel}
                      </span>
                    </td>
                    <td style={{ padding: '7px 4px', textAlign: 'center', fontWeight: 700, color: C.danger, border: `1px solid ${C.border}` }}>
                      {n(r.totalInvoices)}
                    </td>
                    <td style={{ padding: '7px 4px', textAlign: 'center', fontWeight: 700, color: C.success, border: `1px solid ${C.border}` }}>
                      {n(r.totalPayments)}
                    </td>
                    <td style={{ padding: '7px 4px', textAlign: 'center', fontWeight: 800, color: C.orange, border: `1px solid ${C.border}`, fontFamily: 'monospace' }}>
                      {n(r.netBalance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: C.gray, color: C.white, fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '9px 6px', border: `1px solid ${C.border}`, textAlign: 'center' }}>الإجماليات</td>
                <td style={{ padding: '9px 4px', textAlign: 'center', border: `1px solid ${C.border}` }}>{n(grandTotalInvoices)}</td>
                <td style={{ padding: '9px 4px', textAlign: 'center', border: `1px solid ${C.border}` }}>{n(grandTotalPayments)}</td>
                <td style={{ padding: '9px 4px', textAlign: 'center', border: `1px solid ${C.border}`, fontWeight: 800 }}>{n(grandBalance)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Balance summary */}
          <div style={{
            background: `linear-gradient(135deg, #002b61, #0284c7)`,
            color: C.white, borderRadius: '12px', padding: '1.5rem', textAlign: 'center',
            boxShadow: '0 6px 20px rgba(2, 132, 199, 0.25)',
          }}>
            <div style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '0.4rem' }}>إجمالي رصيد كل العملاء</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '0.4rem' }}>
              {n(grandBalance)} جنيه
            </div>
            <div>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
                {customersWithDebt} عميل مديون من أصل {rows.length}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          backgroundColor: C.lightBg, padding: '1rem', borderTop: `1px solid ${C.border}`,
          textAlign: 'center', color: '#666', fontSize: '0.82rem',
        }}>
          <p style={{ fontWeight: 700, color: '#2c3e50', marginBottom: '4px' }}>شكراً لتعاملكم معنا في شركة النسر</p>
          <p style={{ margin: 0 }}>شكراً لتعاملكم معنا ▪ للإدارة والاستفسارات يرجى التواصل عبر الواتساب أو الهاتف</p>
        </div>
      </div>
      </div>
    </div>
  );
}
