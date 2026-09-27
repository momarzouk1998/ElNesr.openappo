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

  const [supplier, invoices, payments, returns, adjustments] = await Promise.all([
    prisma.suppliers.findUnique({ where: { id } }),

    prisma.purchase_invoices.findMany({
      where: { supplier_id: id, status: { not: 'ملغاة' } },
      orderBy: { purchase_date: 'asc' },
      select: {
        id: true, purchase_number: true, purchase_date: true, total_amount: true, status: true, notes: true,
        items: {
          select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
        },
      },
    }),

    prisma.supplier_payments.findMany({
      where: { supplier_id: id },
      orderBy: { payment_date: 'asc' },
      select: {
        id: true, payment_date: true, amount: true, payment_method: true, notes: true,
        treasury: { select: { name: true } },
      },
    }),

    prisma.supplier_return_invoices.findMany({
      where: { supplier_id: id, status: { not: 'ملغاة' } },
      orderBy: { return_date: 'asc' },
      select: {
        id: true, return_number: true, return_date: true, total_amount: true, notes: true,
        items: {
          select: { product_name: true, quantity: true, unit_cost: true, line_total: true },
        },
      },
    }),

    prisma.supplier_adjustments.findMany({
      where: { supplier_id: id },
      orderBy: { adjustment_date: 'asc' },
      select: {
        id: true, adjustment_date: true, amount: true, type: true, notes: true,
        treasury: { select: { name: true } },
      },
    }),
  ]);

  if (!supplier || !supplier.is_active) notFound();

  type EventItem = { product_name: string; quantity: number; unit_cost: number; line_total: number };
  type Entry = {
    date: Date;
    type: 'opening' | 'invoice' | 'payment' | 'return' | 'adjustment';
    label: string;
    ref: string;
    debit: number;
    credit: number;
    balance: number;
    items?: EventItem[];
  };

  let running = Number(supplier.opening_balance || 0);
  const entries: Entry[] = [];

  if (Number(supplier.opening_balance || 0) !== 0) {
    const op = Number(supplier.opening_balance);
    const isCredit = op > 0;
    entries.push({
      date: new Date('1970-01-01'),
      type: 'opening',
      label: 'رصيد افتتاحي',
      ref: '—',
      debit: !isCredit ? Math.abs(op) : 0,
      credit: isCredit ? op : 0,
      balance: running,
    });
  }

  const allEvents: { date: Date; type: 'invoice' | 'payment' | 'return' | 'adjustment'; data: any }[] = [
    ...invoices.map(i => ({ date: new Date(i.purchase_date), type: 'invoice' as const, data: i })),
    ...payments.map(p => ({ date: new Date(p.payment_date), type: 'payment' as const, data: p })),
    ...returns.map(r  => ({ date: new Date(r.return_date),  type: 'return'  as const, data: r })),
    ...adjustments.map(a => ({ date: new Date(a.adjustment_date), type: 'adjustment' as const, data: a })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const ev of allEvents) {
    if (ev.type === 'invoice') {
      const amt = Number(ev.data.total_amount);
      running += amt;
      entries.push({
        date: ev.date,
        type: 'invoice',
        label: 'فاتورة مشتريات',
        ref: `#${ev.data.purchase_number}`,
        debit: 0,
        credit: amt,
        balance: running,
        items: ev.data.items?.map((it: any) => ({
          product_name: it.product_name,
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost),
          line_total: Number(it.line_total),
        })),
      });
    } else if (ev.type === 'payment') {
      const amt = Number(ev.data.amount);
      running -= amt;
      entries.push({
        date: ev.date,
        type: 'payment',
        label: `سداد للمورد (${ev.data.payment_method})`,
        ref: ev.data.notes || (ev.data.treasury?.name ? `خزينة: ${ev.data.treasury.name}` : 'سداد نقدية'),
        debit: amt,
        credit: 0,
        balance: running,
      });
    } else if (ev.type === 'return') {
      const amt = Number(ev.data.total_amount);
      running -= amt;
      entries.push({
        date: ev.date,
        type: 'return',
        label: 'مرتجع مشتريات',
        ref: `↩️ #${ev.data.return_number}`,
        debit: amt,
        credit: 0,
        balance: running,
        items: ev.data.items?.map((it: any) => ({
          product_name: it.product_name,
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost),
          line_total: Number(it.line_total),
        })),
      });
    } else if (ev.type === 'adjustment') {
      const amt = Number(ev.data.amount);
      const isCredit = ev.data.type === 'credit'; // credit = زيادة مستحق له, debit = خصم/استرداد منه
      if (isCredit) {
        running += amt;
      } else {
        running -= amt;
      }
      entries.push({
        date: ev.date,
        type: 'adjustment',
        label: isCredit ? 'إضافة مستحق للمورد' : 'خصم / استرداد من المورد',
        ref: ev.data.notes + (ev.data.treasury?.name ? ` (${ev.data.treasury.name})` : ''),
        debit: !isCredit ? amt : 0,
        credit: isCredit ? amt : 0,
        balance: running,
      });
    }
  }

  const totalDebit   = entries.reduce((s, e) => s + e.debit,  0);
  const totalCredit  = entries.reduce((s, e) => s + e.credit, 0);
  const finalBalance = running;
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
        }
      `}</style>

      {/* Floating Action Bar */}
      <PrintActions
        backLink={`/suppliers/${id}`}
        backLabel="↩️ عودة لبيانات المورد"
        fileName={`كشف حساب مورد - ${supplier.name}`}
        title={`كشف حساب مورد: ${supplier.name}`}
      />

      <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div id="statement" style={{
        maxWidth: '850px', width: '100%', backgroundColor: C.white,
        borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        border: `1.5px solid ${C.border}`, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: C.gray, color: C.white,
          padding: '1.2rem 1.5rem', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
          borderBottom: `4px solid ${C.orange}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {LOGO_BASE64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={LOGO_BASE64}
                alt="شركة النسر"
                style={{ width: '60px', height: '60px', objectFit: 'contain', backgroundColor: C.white, borderRadius: '8px', padding: '4px' }}
              />
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: C.white }}>
                شركة النسر للأدوات واللوحات الكهربائية
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
                كشف حساب تفصيلي للمورد مع بيان الأصناف
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'left', fontSize: '0.82rem', opacity: 0.9, lineHeight: 1.6 }}>
            <div>تاريخ الاستخراج: <strong>{formatDate(new Date())}</strong></div>
            <div>الحالة: <strong style={{ color: '#bae6fd' }}>نشط</strong></div>
          </div>
        </div>

        <div style={{ padding: '1.2rem 1.5rem' }}>
          {/* Supplier Info Box */}
          <div style={{
            backgroundColor: C.lightBg, border: `1.5px solid ${C.border}`,
            borderRadius: '10px', padding: '1rem 1.2rem', marginBottom: '1.2rem',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem',
          }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: C.muted, display: 'block', marginBottom: '2px' }}>اسم المورد</span>
              <strong style={{ fontSize: '1.05rem', color: C.gray }}>🏭 {supplier.name}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: C.muted, display: 'block', marginBottom: '2px' }}>الهاتف</span>
              <strong style={{ fontSize: '0.95rem', color: C.text, fontFamily: 'monospace' }}>{supplier.phone || '—'}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: C.muted, display: 'block', marginBottom: '2px' }}>العنوان</span>
              <strong style={{ fontSize: '0.95rem', color: C.text }}>{supplier.address || '—'}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: C.muted, display: 'block', marginBottom: '2px' }}>الرصيد الافتتاحي</span>
              <strong style={{ fontSize: '0.95rem', color: C.text, fontFamily: 'monospace' }}>{n(Number(supplier.opening_balance))} ج</strong>
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem', marginBottom: '1.2rem' }}>
            <div style={{
              background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`,
              border: `2px solid ${C.danger}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>المستحق له (شراء)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.danger }}>{n(totalCredit)} ج</div>
            </div>
            <div style={{
              background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`,
              border: `2px solid ${C.success}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>المسدد له (سداد/مرتجع)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.success }}>{n(totalDebit)} ج</div>
            </div>
            <div style={{
              background: `linear-gradient(135deg, ${C.white}, ${C.lightBg})`,
              border: `2px solid ${C.gray}`, borderRadius: '10px', padding: '0.8rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.3rem' }}>عدد الحركات</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: C.gray }}>{entries.length}</div>
            </div>
          </div>

          {/* Transactions table */}
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: C.gray, color: C.white }}>
                <th style={{ width: '15%', padding: '8px 6px', textAlign: 'right', border: `1px solid ${C.border}` }}>التاريخ</th>
                <th style={{ width: '31%', padding: '8px 6px', textAlign: 'right', border: `1px solid ${C.border}` }}>البيان / الحركة</th>
                <th style={{ width: '12%', padding: '8px 6px', textAlign: 'right', border: `1px solid ${C.border}` }}>المرجع</th>
                <th style={{ width: '14%', padding: '8px 6px', textAlign: 'center', border: `1px solid ${C.border}` }}>مستحق له (+)</th>
                <th style={{ width: '14%', padding: '8px 6px', textAlign: 'center', border: `1px solid ${C.border}` }}>مسدد له (-)</th>
                <th style={{ width: '14%', padding: '8px 6px', textAlign: 'center', border: `1px solid ${C.border}` }}>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const bgColor = e.type === 'opening' ? '#f1f5f9' : i % 2 === 0 ? C.white : C.lightBg;
                const balColor = e.balance > 0.01 ? C.danger : e.balance < -0.01 ? C.success : C.muted;
                const hasItems = e.items && e.items.length > 0;

                return (
                  <tr key={`entry-${i}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ backgroundColor: bgColor, fontWeight: e.type === 'opening' ? 700 : 400 }}>
                            <td style={{ width: '15%', padding: '8px 6px', border: `1px solid ${C.border}`, fontSize: '0.8rem' }}>
                              {e.date.getFullYear() === 1970 ? '—' : formatDate(e.date)}
                            </td>
                            <td style={{ width: '31%', padding: '8px 6px', border: `1px solid ${C.border}` }}>
                              <span style={{
                                backgroundColor: e.type === 'invoice' ? '#dbeafe' : e.type === 'return' ? '#ffedd5' : e.type === 'payment' ? '#dcfce7' : '#f1f5f9',
                                color: e.type === 'invoice' ? '#1e40af' : e.type === 'return' ? '#c2410c' : e.type === 'payment' ? '#166534' : C.gray,
                                padding: '2px 6px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                              }}>
                                {e.type === 'invoice' ? '📥 شراء' : e.type === 'return' ? '↩️ مرتجع' : e.type === 'payment' ? '💸 سداد' : '📂 افتتاحي'}
                              </span>
                              <span style={{ marginRight: '4px', fontWeight: 600, fontSize: '0.8rem' }}>{e.label}</span>
                            </td>
                            <td style={{ width: '12%', padding: '8px 4px', border: `1px solid ${C.border}`, fontFamily: 'monospace', color: C.muted, fontSize: '0.78rem' }}>{e.ref}</td>
                            <td style={{ width: '14%', padding: '8px 4px', textAlign: 'center', fontWeight: 700, color: e.credit > 0 ? C.danger : C.muted, border: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: '0.82rem' }}>
                              {e.credit > 0 ? n(e.credit) : '—'}
                            </td>
                            <td style={{ width: '14%', padding: '8px 4px', textAlign: 'center', fontWeight: 700, color: e.debit > 0 ? C.success : C.muted, border: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: '0.82rem' }}>
                              {e.debit > 0 ? n(e.debit) : '—'}
                            </td>
                            <td style={{ width: '14%', padding: '8px 4px', textAlign: 'center', fontWeight: 800, color: balColor, border: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {n(e.balance)}
                            </td>
                          </tr>

                          {/* جدول تفاصيل الأصناف المشتراة / المرتجعة المدمج */}
                          {hasItems && (
                            <tr style={{ backgroundColor: '#fafafa' }}>
                              <td colSpan={6} style={{ padding: '6px 8px 8px 8px', border: `1px solid ${C.border}` }}>
                                <div style={{
                                  backgroundColor: '#ffffff',
                                  borderRadius: '8px',
                                  border: `1.5px solid #cbd5e1`,
                                  padding: '6px 8px',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: C.gray, marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>📦 تفاصيل أصناف الفاتورة (عدد: {e.items!.length}):</span>
                                  </div>
                                  <table style={{ width: '100%', tableLayout: 'fixed', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ backgroundColor: '#f1f5f9', color: C.gray, fontSize: '0.73rem', borderBottom: '1px solid #cbd5e1' }}>
                                        <th style={{ width: '50%', padding: '3px 6px', textAlign: 'right' }}>اسم الصنف / البيان</th>
                                        <th style={{ width: '15%', padding: '3px 6px', textAlign: 'center' }}>الكمية</th>
                                        <th style={{ width: '17%', padding: '3px 6px', textAlign: 'left' }}>سعر الشراء</th>
                                        <th style={{ width: '18%', padding: '3px 6px', textAlign: 'left' }}>الإجمالي</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {e.items!.map((it, idx) => (
                                        <tr key={idx} style={{ borderBottom: idx < e.items!.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                          <td style={{ padding: '3px 6px', fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.product_name}</td>
                                          <td style={{ padding: '3px 6px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 900, color: C.darkGray }}>
                                            {it.quantity}
                                          </td>
                                          <td style={{ padding: '3px 6px', textAlign: 'left', fontFamily: 'monospace' }}>
                                            {n(it.unit_cost)}
                                          </td>
                                          <td style={{ padding: '3px 6px', textAlign: 'left', fontFamily: 'monospace', fontWeight: 900, color: C.gray }}>
                                            {n(it.line_total)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: C.gray, color: C.white, fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '10px', border: `1px solid ${C.border}`, textAlign: 'center' }}>الإجماليات</td>
                <td style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>{n(totalCredit)}</td>
                <td style={{ padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>{n(totalDebit)}</td>
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
            <div style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '0.4rem' }}>الرصيد النهائي المستحق للمورد</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '0.4rem' }}>
              {n(finalBalance)} جنيه
            </div>
            <div>
              <span style={{
                fontSize: '1rem', fontWeight: 800,
                color: finalBalance > 0 ? '#fecdd3' : finalBalance < 0 ? '#a7f3d0' : C.white,
              }}>
                {finalBalance > 0 ? 'مستحق له علينا (مديونية)' : finalBalance < 0 ? 'رصيد لصالحنا (دائن)' : 'خالص ✅'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          backgroundColor: C.lightBg, padding: '1rem', borderTop: `1px solid ${C.border}`,
          textAlign: 'center', color: '#666', fontSize: '0.82rem',
        }}>
          <p style={{ fontWeight: 700, color: '#2c3e50', marginBottom: '4px' }}>شركة النسر للأدوات واللوحات الكهربائية</p>
          <p style={{ margin: 0 }}>شكراً لتعاملكم معنا ▪ للإدارة والاستفسارات يرجى التواصل عبر الواتساب أو الهاتف</p>
        </div>
      </div>
      </div>
    </div>
  );
}
