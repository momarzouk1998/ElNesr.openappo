import { prisma } from '@/lib/db/prisma-direct';
import { formatEGP, formatQty, formatDate } from '@/lib/format';
import PrintActions from '@/app/print/invoice/[id]/PrintActions';

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

export default async function PrintInventoryReportPage() {
  const stores = await prisma.stores.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
  });

  const inventoryItems = await prisma.inventory.findMany({
    include: {
      product: true,
      store: true,
    },
    orderBy: [
      { store: { name: 'asc' } },
      { product: { name: 'asc' } },
    ],
  });

  // Group inventory items by store
  const storeGroups = stores.map(store => {
    const items = inventoryItems.filter(i => i.store_id === store.id);
    const totalQty = items.reduce((sum, item) => sum + Number(item.current_stock || 0), 0);
    const totalValue = items.reduce((sum, item) => {
      const qty = Number(item.current_stock || 0);
      const price = Number(item.product?.last_purchase_price || 0);
      return sum + (qty > 0 ? qty * price : 0);
    }, 0);
    const lowStockCount = items.filter(item => Number(item.current_stock || 0) <= Number(item.product?.reorder_level || 0)).length;

    const positiveItems = items.filter(i => Number(i.current_stock || 0) > 0);

    return {
      store,
      items,
      totalItems: positiveItems.length,
      totalQty,
      totalValue,
      lowStockCount,
    };
  });

  const overallItems = inventoryItems.filter(i => Number(i.current_stock || 0) > 0).length;
  const overallQty = inventoryItems.reduce((sum, i) => sum + Number(i.current_stock || 0), 0);
  const overallValue = inventoryItems.reduce((sum, i) => {
    const qty = Number(i.current_stock || 0);
    const price = Number(i.product?.last_purchase_price || 0);
    return sum + (qty > 0 ? qty * price : 0);
  }, 0);
  const overallLowStock = inventoryItems.filter(i => Number(i.current_stock || 0) <= Number(i.product?.reorder_level || 0)).length;

  const todayStr = formatDate(new Date());

  return (
    <div style={{
      backgroundColor: '#f1f5f9',
      minHeight: '100vh',
      padding: '1.5rem 1rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: C.text,
      direction: 'rtl',
    }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: #ffffff !important; padding: 0 !important; }
          #inventory-report {
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          .table-container { overflow: visible !important; }
          table { width: 100% !important; font-size: 11px !important; }
          th, td { padding: 5px 6px !important; }
        }
      `}</style>
      <PrintActions
        backLink="/inventory"
        backLabel="↩️ العودة للمخازن"
        fileName={`تقرير-المخازن-${todayStr}`}
        targetId="inventory-report"
      />

      <div id="inventory-report" style={{
        maxWidth: '960px',
        margin: '0 auto',
        backgroundColor: C.white,
        borderRadius: '12px',
        boxShadow: '0 4px 25px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        border: `1px solid ${C.border}`,
      }}>
        {/* Header Banner */}
        <div style={{
          background: `linear-gradient(135deg, #002b61, #0284c7)`,
          color: C.white,
          padding: '1.5rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>شركة النسر</h1>
            <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '1rem', fontWeight: 600 }}>
              📦 تقرير جرد وإحصائيات المخازن الشامل
            </p>
          </div>
          <div style={{ textAlign: 'left', fontSize: '0.85rem', opacity: 0.95 }}>
            <div>تاريخ التقرير: <strong>{todayStr}</strong></div>
            <div>عدد الفروع/المخازن: <strong>{stores.length}</strong></div>
          </div>
        </div>

        {/* Overall Summary Cards */}
        <div style={{ padding: '1.25rem 1.5rem', backgroundColor: C.lightBg, borderBottom: `1px solid ${C.border}` }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}>
            <div style={{ backgroundColor: C.white, padding: '1rem', borderRadius: '8px', border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, fontWeight: 700 }}>إجمالي الأصناف بالمخازن</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.orange, marginTop: '2px' }}>{overallItems} صنف</div>
            </div>
            <div style={{ backgroundColor: C.white, padding: '1rem', borderRadius: '8px', border: '1px solid ' + C.border, textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, fontWeight: 700 }}>إجمالي عدد القطع والكميات</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>{formatQty(overallQty)} قطعة</div>
            </div>
            <div style={{ backgroundColor: C.white, padding: '1rem', borderRadius: '8px', border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, fontWeight: 700 }}>إجمالي قيمة التكلفة الشرائية</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.success, marginTop: '2px' }}>{formatEGP(overallValue)} ج</div>
            </div>
            <div style={{ backgroundColor: C.white, padding: '1rem', borderRadius: '8px', border: '1px solid ' + C.border, textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: C.muted, fontWeight: 700 }}>أصناف تحت الحد الأدنى</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: overallLowStock > 0 ? C.danger : C.success, marginTop: '2px' }}>{overallLowStock} صنف</div>
            </div>
          </div>
        </div>

        {/* Store by Store Inventory Details */}
        <div style={{ padding: '1.5rem' }}>
          {storeGroups.map(({ store, items, totalItems, totalQty, totalValue, lowStockCount }) => (
            <div key={store.id} style={{ marginBottom: '2.5rem', borderRadius: '8px', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {/* Store Section Header */}
              <div style={{
                backgroundColor: '#2c3e50',
                color: C.white,
                padding: '0.85rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏪 {store.name}</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8, backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
                    {store.type}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>الأصناف: <strong>{totalItems}</strong></span>
                  <span>إجمالي الكمية: <strong>{formatQty(totalQty)}</strong></span>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: '6px' }}>
                    التكلفة: <strong style={{ color: '#4ade80' }}>{formatEGP(totalValue)} ج</strong>
                  </span>
                </div>
              </div>

              {/* Items Table Container */}
              <div className="table-container" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: C.lightBg, color: C.muted, fontWeight: 700, borderBottom: `2px solid ${C.border}` }}>
                      <th style={{ padding: '8px 6px', textAlign: 'center', width: '35px' }}>#</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>اسم الصنف</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: '90px' }}>الفئة</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', width: '60px' }}>الوحدة</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: '100px' }}>الكمية الحالية</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', width: '75px' }}>الحد الأدنى</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', width: '85px' }}>سعر الشراء</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: '120px' }}>إجمالي التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: '1.5rem', textAlign: 'center', color: C.muted }}>
                          لا توجد أصناف مسجلة في هذا المخزن حالياً
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => {
                        const qty = Number(item.current_stock || 0);
                        const reorder = Number(item.product?.reorder_level || 0);
                        const isLow = qty <= reorder;
                        const price = Number(item.product?.last_purchase_price || 0);
                        const itemValue = qty > 0 ? qty * price : 0;
                        const unitLabel = item.product?.unit === 'piece' ? 'قطعة' : item.product?.unit === 'box' ? 'علبة' : 'كرتونة';

                        return (
                          <tr key={item.id} style={{
                            borderBottom: `1px solid ${C.border}`,
                            backgroundColor: isLow ? '#fff5f5' : idx % 2 === 0 ? C.white : '#fdfdfd',
                          }}>
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: C.muted }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1e293b' }}>
                              {item.product?.name || '—'}
                              {isLow && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', marginRight: '6px', fontWeight: 700 }}>
                                  ⚠️ منخفض
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'center', color: C.muted }}>{item.product?.category || '—'}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: C.muted }}>{unitLabel}</td>
                            <td style={{
                              padding: '8px 8px',
                              textAlign: 'center',
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              fontSize: '0.95rem',
                              color: qty < 0 ? C.danger : isLow ? '#d97706' : C.orange,
                            }}>
                              {formatQty(qty)}
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'center', fontFamily: 'monospace', color: C.muted }}>{reorder}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'center', fontFamily: 'monospace', color: C.muted }}>{formatEGP(price)}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', color: C.success, whiteSpace: 'nowrap' }}>
                              {formatEGP(itemValue)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot>
                      <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800, borderTop: `2px solid ${C.border}` }}>
                        <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                          إجمالي {store.name} ({totalItems} صنف)
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace', color: C.orange, fontSize: '1rem' }}>
                          {formatQty(totalQty)}
                        </td>
                        <td colSpan={2}></td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontFamily: 'monospace', color: C.success, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                          {formatEGP(totalValue)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* Master Grand Total Summary Footer */}
        <div style={{
          backgroundColor: `linear-gradient(135deg, #002b61, #0284c7)`,
          background: `linear-gradient(135deg, #002b61, #0284c7)`,
          color: C.white,
          padding: '1.5rem',
          margin: '0 1.5rem 1.5rem',
          borderRadius: '10px',
          textAlign: 'center',
          boxShadow: '0 4px 15px rgba(2, 132, 199, 0.25)',
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            🏆 الإجمالي العام لجميع المخازن والحسابات
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.2)',
          }}>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>إجمالي عدد الأصناف</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{overallItems} صنف</div>
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>إجمالي كمية البضاعة (القطع)</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fef08a' }}>{formatQty(overallQty)} قطعة</div>
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>إجمالي قيمة البضاعة بالكامل (التكلفة)</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#86efac' }}>{formatEGP(overallValue)} جنيه</div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{
          backgroundColor: C.lightBg,
          padding: '1rem',
          borderTop: `1px solid ${C.border}`,
          textAlign: 'center',
          color: '#666',
          fontSize: '0.82rem',
        }}>
          <p style={{ fontWeight: 700, color: '#2c3e50', marginBottom: '4px' }}>شكراً لتعاملكم معنا في شركة النسر</p>
          <p style={{ margin: 0 }}>شكراً لتعاملكم معنا ▪ للإدارة والاستفسارات يرجى التواصل عبر الواتساب أو الهاتف</p>
        </div>
      </div>
    </div>
  );
}
