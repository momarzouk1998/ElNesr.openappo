import { prisma } from '@/lib/db/prisma-direct';
import { notFound } from 'next/navigation';
import { formatEGP, formatDate } from '@/lib/format';
import PrintActions from '@/app/print/invoice/[id]/PrintActions';
import { LOGO_BASE64 } from '@/lib/logo-base64';

export const dynamic = 'force-dynamic';

const C = {
  orange: '#0284c7',
  darkOrange: '#0369a1',
  gray: '#002b61',
  darkGray: '#001a3a',
  text: '#343a40',
  lightBg: '#f8f9fa',
  border: '#dee2e6',
  success: '#28a745',
  danger: '#dc3545',
  white: '#ffffff',
  muted: '#6c757d',
} as const;

export default async function SupplierStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [supplier, invoices, payments, returns] = await Promise.all([
    prisma.suppliers.findUnique({ where: { id } }),

    prisma.purchase_invoices.findMany({
      where: { supplier_id: id, status: { not: 'ملغاة' } },
      orderBy: { purchase_date: 'asc' },
      select: {
        id: true, purchase_number: true, purchase_date: true, total_amount: true, status: true,
        items: {
          select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
        },
      },
    }),

    prisma.supplier_payments.findMany({
      where: { supplier_id: id },
      orderBy: { payment_date: 'asc' },
      select: { id: true, payment_date: true, amount: true, payment_method: true, notes: true },
    }),

    prisma.supplier_return_invoices.findMany({
      where: { supplier_id: id, status: { not: 'ملغاة' } },
      orderBy: { return_date: 'asc' },
      select: {
        id: true, return_number: true, return_date: true, total_amount: true,
        items: {
          select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
        },
      },
    }),
  ]);

  if (!supplier || !supplier.is_active) notFound();

  type Entry = {
    date: Date;
    type: 'opening' | 'invoice' | 'payment' | 'return';
    label: string;
    ref: string;
    debit: number;
    credit: number;
    balance: number;
  };

  let running = Number(supplier.opening_balance);
  const entries: Entry[] = [];

  if (Number(supplier.opening_balance) !== 0) {
    entries.push({
      date: new Date('1970-01-01'),
      type: 'opening',
      label: 'رصيد افتتاحي',
      ref: '—',
      debit:  Number(supplier.opening_balance) > 0 ? Number(supplier.opening_balance) : 0,
      credit: Number(supplier.opening_balance) < 0 ? Math.abs(Number(supplier.opening_balance)) : 0,
      balance: running,
    });
  }

  const allEvents: { date: Date; type: 'invoice' | 'payment' | 'return'; data: any }[] = [
    ...invoices.map(i => ({ date: new Date(i.purchase_date), type: 'invoice' as const, data: i })),
    ...payments.map(p => ({ date: new Date(p.payment_date), type: 'payment' as const, data: p })),
    ...returns.map(r  => ({ date: new Date(r.return_date),  type: 'return'  as const, data: r })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const ev of allEvents) {
    if (ev.type === 'invoice') {
      running += Number(ev.data.total_amount);
      entries.push({
        date: ev.date, type: 'invoice', label: 'فاتورة مشتريات',
        ref: `#${ev.data.purchase_number}`,
        debit: Number(ev.data.total_amount), credit: 0, balance: running,
      });
    } else if (ev.type === 'payment') {
      running -= Number(ev.data.amount);
      entries.push({
        date: ev.date, type: 'payment',
        label: ev.data.notes || 'سداد للمورد',
        ref: ev.data.payment_method,
        debit: 0, credit: Number(ev.data.amount), balance: running,
      });
    } else {
      running -= Number(ev.data.total_amount);
      entries.push({
        date: ev.date, type: 'return', label: 'مرتجع للمورد',
        ref: `↩️ #${ev.data.return_number}`,
        debit: 0, credit: Number(ev.data.total_amount), balance: running,
      });
    }
  }

  const totalDebit   = entries.reduce((s, e) => s + e.debit,  0);
  const totalCredit  = entries.reduce((s, e) => s + e.credit, 0);
  const finalBalance = Number(supplier.balance);
  const totalPurchases = invoices.reduce((s, inv) => s + Number(inv.total_amount), 0);
  const totalReturns = returns.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalPaymentsSum = payments.reduce((s, p) => s + Number(p.amount), 0);

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
        backLink="/suppliers"
        backLabel="↩️ العودة للموردين"
        fileName={`كشف حساب - ${supplier.name}`}
        targetId="statement"
        customerPhone={supplier.phone}
        customerName={supplier.name}
        title="كشف حساب مورد"
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
              كشف حساب مورد
            </div>
            <div style={{ fontSize: '0.8rem', color: C.muted, fontWeight: 700, marginTop: '6px' }}>
              تاريخ الاستخراج: {formatDate(new Date())}
            </div>
          </div>
        </div>

        <div style={{ padding: '1.5rem 1.8rem' }}>
          {/* Supplier info */}
          <div style={{
            backgroundColor: C.lightBg, border: `1px solid ${C.border}`, borderRadius: '8px',
            padding: '0.8rem 1.2rem', marginBottom: '1.2rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ color: C.muted, fontSize: '0.9rem', fontWeight: 600 }}>اسم المورد: </span>
              <span style={{ color: C.text, fontWeight: 800, fontSize: '1.2rem' }}>{supplier.name}</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              {supplier.phone && <span style={{ color: C.muted, fontSize: '0.85rem' }}>📞 {supplier.phone}</span>}
            </div>
          </div>

          {/* Financial cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', marginBottom: '1.5rem' }}>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.orange}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>رصيد افتتاحي</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.orange }}>{n(Number(supplier.opening_balance))}</div>
            </div>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.danger}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>مستحق (علينا)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.danger }}>{n(totalDebit)}</div>
            </div>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.success}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>مدفوع (له)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.success }}>{n(totalCredit)}</div>
            </div>
            <div style={{ background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`, border: `2px solid ${C.gray}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>عدد الحركات</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.gray }}>{entries.length}</div>
            </div>
          </div>

          {/* Transactions table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: C.gray, color: C.white }}>
                <th style={{ padding: '10px', textAlign: 'right', border: `1px solid ${C.border}` }}>التاريخ</th>
                <th style={{ padding: '10px', textAlign: 'right', border: `1px solid ${C.border}` }}>البيان</th>
                <th style={{ padding: '10px', textAlign: 'right', border: `1px solid ${C.border}` }}>المرجع</th>
                <th style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>مستحق (علينا)</th>
                <th style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>مدفوع (له)</th>
                <th style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const bgColor = e.type === 'opening' ? '#f1f5f9' : i % 2 === 0 ? C.white : C.lightBg;
                const balColor = e.balance > 0.01 ? C.danger : e.balance < -0.01 ? C.success : C.muted;
                return (
                  <tr key={i} style={{ backgroundColor: bgColor, fontWeight: e.type === 'opening' ? 700 : 400 }}>
                    <td style={{ padding: '9px', border: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                      {e.date.getFullYear() === 1970 ? '—' : formatDate(e.date)}
                    </td>
                    <td style={{ padding: '9px', border: `1px solid ${C.border}` }}>
                      <span style={{
                        backgroundColor: e.type === 'invoice' ? '#dbeafe' : e.type === 'return' ? '#ffedd5' : e.type === 'payment' ? '#dcfce7' : '#f1f5f9',
                        color: e.type === 'invoice' ? '#1e40af' : e.type === 'return' ? '#c2410c' : e.type === 'payment' ? '#166534' : C.gray,
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700,
                      }}>
                        {e.type === 'invoice' ? '📥 شراء' : e.type === 'return' ? '↩️ مرتجع' : e.type === 'payment' ? '💸 سداد' : '📂 افتتاحي'}
                      </span>
                      <span style={{ marginRight: '6px', fontWeight: 600 }}>{e.label}</span>
                    </td>
                    <td style={{ padding: '9px', border: `1px solid ${C.border}`, fontFamily: 'monospace', color: C.muted }}>{e.ref}</td>
                    <td style={{ padding: '9px', textAlign: 'center', fontWeight: 700, color: e.debit > 0 ? C.danger : C.muted, border: `1px solid ${C.border}` }}>
                      {e.debit > 0 ? n(e.debit) : '—'}
                    </td>
                    <td style={{ padding: '9px', textAlign: 'center', fontWeight: 700, color: e.credit > 0 ? C.success : C.muted, border: `1px solid ${C.border}` }}>
                      {e.credit > 0 ? n(e.credit) : '—'}
                    </td>
                    <td style={{ padding: '9px', textAlign: 'center', fontWeight: 800, color: balColor, border: `1px solid ${C.border}`, fontFamily: 'monospace' }}>
                      {n(e.balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: C.gray, color: C.white, fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '10px', border: `1px solid ${C.border}`, textAlign: 'center' }}>الإجماليات</td>
                <td style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>{n(totalDebit)}</td>
                <td style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>{n(totalCredit)}</td>
                <td style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}`, fontWeight: 800 }}>{n(finalBalance)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem', marginBottom: '1.5rem' }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>إجمالي المشتريات</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e40af' }}>{n(totalPurchases)} ج</div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>إجمالي المرتجعات</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#c2410c' }}>{n(totalReturns)} ج</div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>إجمالي المدفوعات</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.success }}>{n(totalPaymentsSum)} ج</div>
            </div>
          </div>

          {/* Balance summary */}
          <div style={{
            background: `linear-gradient(135deg, #002b61, #0284c7)`,
            color: C.white, borderRadius: '12px', padding: '1.5rem', textAlign: 'center',
            boxShadow: '0 6px 20px rgba(2, 132, 199, 0.25)',
          }}>
            <div style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '0.4rem' }}>المتبقي للمورد</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '0.4rem' }}>
              {n(finalBalance)} جنيه
            </div>
            <div>
              <span style={{
                fontSize: '1rem', fontWeight: 800,
                color: finalBalance > 0 ? '#fecdd3' : finalBalance < 0 ? '#a7f3d0' : C.white,
              }}>
                {finalBalance > 0 ? 'مستحق علينا' : finalBalance < 0 ? 'رصيد لصالحنا' : 'خالص ✅'}
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
