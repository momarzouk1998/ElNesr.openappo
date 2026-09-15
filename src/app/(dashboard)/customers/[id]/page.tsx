"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate, statusColor } from "@/lib/format";
import ConfirmDialog from "@/components/ConfirmDialog";
import PaymentReceiptModal from "@/components/PaymentReceiptModal";
import CustomerStatementModal from "@/components/CustomerStatementModal";

interface CustomerDetail {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  opening_balance: number;
  balance: number;
  route_days: string[];
  notes: string | null;
}
interface Payment {
  id: string; payment_date: string; amount: number; payment_method: string; notes: string | null;
  treasury?: { id: string; name: string } | null;
}
interface Invoice {
  id: string; invoice_number: number; invoice_date: string; status: string; total: number;
}
const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCollect, setShowCollect] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/customers/${params.id}`);
        const json = await res.json();
        setCustomer(json?.data ?? null);
      } catch {
        setCustomer(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) load();
  }, [params.id, reloadKey]);

  // تحديث بيانات العميل (رصيد، اسم... إلخ) بدون reload كامل للصفحة
  const reloadCustomer = useCallback(() => setReloadKey(k => k + 1), []);

  if (loading) return <div className="card py-12 text-center text-gray-500">⏳ جاري التحميل...</div>;

  if (!customer) {
    return <div className="space-y-4">
      <button onClick={() => router.back()} className="btn-secondary">↩️ العودة</button>
      <div className="card py-12 text-center text-gray-500">لا توجد بيانات لهذا العميل</div>
    </div>;
  }

  return (
    <div className="space-y-4">
      {/* رأس الصفحة */}
      <div className="space-y-2">
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 break-words">
          👤 {customer.name}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdjustment(true)}
            className="text-xs sm:text-sm font-bold px-3 py-2 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <span>💸</span>
            <span>سلفة / إضافة مبلغ</span>
          </button>
          <button
            onClick={() => setShowStatementModal(true)}
            className="text-xs sm:text-sm font-bold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <span>🖨️</span>
            <span>كشف حساب</span>
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="text-xs sm:text-sm font-bold p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 shadow-sm cursor-pointer"
            title="تعديل"
          >
            ✏️
          </button>
          <button
            onClick={() => deleteCustomer(customer, router)}
            className="text-xs sm:text-sm font-bold p-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 shadow-sm cursor-pointer"
            title="حذف"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* جدول بيانات العميل */}
      <div className="card p-0 overflow-hidden border border-slate-200">
        <table className="w-full text-xs sm:text-sm border-collapse">
          <tbody>
            <tr className="border-b bg-slate-50/50">
              <td className="p-2.5 font-bold text-gray-500 w-1/4 border-l">الهاتف:</td>
              <td className="p-2.5 font-semibold text-slate-800 font-mono w-1/4 border-l">{customer.phone || '—'}</td>
              <td className="p-2.5 font-bold text-gray-500 w-1/4 border-l">الواتساب:</td>
              <td className="p-2.5 font-semibold text-slate-800 font-mono w-1/4">{customer.whatsapp || '—'}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2.5 font-bold text-gray-500 border-l">رصيد افتتاحي:</td>
              <td className="p-2.5 font-bold font-mono text-slate-700 border-l">{formatEGP(customer.opening_balance)} ج</td>
              <td className="p-2.5 font-bold text-gray-500 border-l">الرصيد الحالي:</td>
              <td className={`p-2.5 font-extrabold font-mono text-base ${Number(customer.balance) > 0 ? 'text-red-700' : Number(customer.balance) < 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                {formatEGP(customer.balance)} ج
              </td>
            </tr>
            <tr className="border-b bg-slate-50/50">
              <td className="p-2.5 font-bold text-gray-500 border-l">العنوان:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800">{customer.address || '—'}</td>
            </tr>
            <tr>
              <td className="p-2.5 font-bold text-gray-500 border-l">الملاحظات:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800">{customer.notes || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* قسم كشف الحساب */}
      <StatementSection customerId={customer.id} balance={Number(customer.balance)} onCollect={() => setShowCollect(true)} onCustomerChanged={reloadCustomer} />

      {/* قسم فواتير العميل */}
      <InvoicesSection customerId={customer.id} />

      {showCollect && (
        <CollectForm customerId={customer.id} onClose={() => setShowCollect(false)} onSaved={() => { setShowCollect(false); reloadCustomer(); }} />
      )}

      {showAdjustment && (
        <CustomerAdjustmentModal customerId={customer.id} customerName={customer.name} onClose={() => setShowAdjustment(false)} onSaved={() => { setShowAdjustment(false); reloadCustomer(); }} />
      )}

      {showEdit && (
        <EditForm customer={customer} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); reloadCustomer(); }} />
      )}

      {showStatementModal && (
        <CustomerStatementModal customerId={customer.id} onClose={() => setShowStatementModal(false)} />
      )}
    </div>
  );
}

// حذف العميل (مع تأكيد الحذف الشامل للفواتير والمدفوعات إن وجدت)
async function deleteCustomer(customer: CustomerDetail, router: ReturnType<typeof useRouter>) {
  if (!confirm(`هل تريد بالتأكيد حذف العميل "${customer.name}"؟`)) return;

  const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE', cache: 'no-store' });
  const json = await res.json();

  if (!res.ok) {
    if (json?.requires_confirmation) {
      const confirmed = confirm(json.message);
      if (confirmed) {
        const forceRes = await fetch(`/api/customers/${customer.id}?force=true`, { method: 'DELETE', cache: 'no-store' });
        const forceJson = await forceRes.json();
        if (!forceRes.ok) {
          alert('❌ ' + (forceJson?.error?.message || 'تعذّر حذف العميل'));
          return;
        }
        alert('✅ تم حذف العميل وجميع معاملاته وفواتيره بنجاح');
        router.push('/customers');
        return;
      }
      return;
    }
    alert('❌ ' + (json?.error?.message || json?.error?.code || 'تعذّر الحذف'));
    return;
  }

  alert('✅ تم حذف العميل بنجاح');
  router.push('/customers');
}

/* ============================================
   قسم كشف الحساب
============================================ */
function StatementSection({ customerId, balance, onCollect, onCustomerChanged }: { customerId: string; balance: number; onCollect: () => void; onCustomerChanged: () => void }) {
  const { data, loading, refetch } = useApi<{ items: Payment[]; total_amount: number }>(`/api/payments/customers?customer_id=${customerId}&limit=9999`);
  const payments = data?.items || [];
  const totalPaid = data?.total_amount || 0;
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  // تعديل مدفوعة
  async function editPayment(payment: Payment) {
    setEditingPayment(payment);
  }

  // حذف مدفوعة - مع مربع تأكيد محسن
  async function deletePayment(payment: Payment) {
    setDeletingPayment(payment);
  }

  async function confirmDeletePayment() {
    if (!deletingPayment) return;

    try {
      const res = await fetch(`/api/payments/customers/${deletingPayment.id}`, { method: 'DELETE' });
      const json = await res.json();
      
      if (!res.ok) {
        alert('❌ ' + (json?.error?.message || json?.error?.code || 'فشل في الحذف'));
        return;
      }
      
      alert('✅ تم حذف المدفوعة وإرجاع المبلغ لرصيد العميل');
      refetch(); // تحديث قائمة المدفوعات
      onCustomerChanged(); // تحديث رصيد العميل بدون reload كامل
    } catch (e) {
      alert('❌ حدث خطأ أثناء الحذف');
    } finally {
      setDeletingPayment(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📋 كشف الحساب</h2>
        <button onClick={onCollect} className="btn-primary text-sm">+ تحصيل جديد</button>
      </div>

      {loading ? <div className="card text-center py-8 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الخزينة</th>
                <th className="p-3 text-right">طريقة الدفع</th>
                <th className="p-3 text-right">البيان</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedReceiptId(p.id)}
                  className="border-t hover:bg-emerald-50/60 cursor-pointer transition-colors"
                  title="اضغط لعرض وتدقيق ومشاركة إيصال التحصيل عبر واتساب"
                >
                  <td className="p-3 text-xs">{formatDate(p.payment_date)}</td>
                  <td className="p-3 text-xs text-gray-600">{p.treasury?.name || '—'}</td>
                  <td className="p-3 text-xs">{p.payment_method}</td>
                  <td className="p-3">{p.notes || 'تحصيل من عميل'}</td>
                  <td className="p-3 font-mono font-bold text-green-700">{formatEGP(p.amount)}</td>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => setSelectedReceiptId(p.id)}
                        className="text-xs px-2 py-1 bg-emerald-100 text-emerald-800 rounded hover:bg-emerald-200 font-bold cursor-pointer"
                        title="إيصال التحصيل"
                      >
                        💳 إيصال
                      </button>
                      <button
                        onClick={() => editPayment(p)}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 cursor-pointer"
                        title="تعديل"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deletePayment(p)}
                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 cursor-pointer"
                        title="حذف"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد حركات</td></tr>}
            </tbody>
            {payments.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={5} className="p-3 text-left">الإجمالي:</td>
                  <td className="p-3 font-mono">{formatEGP(totalPaid)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      
      {selectedReceiptId && (
        <PaymentReceiptModal paymentId={selectedReceiptId} onClose={() => setSelectedReceiptId(null)} />
      )}
      
      {editingPayment && (
        <EditPaymentForm
          payment={editingPayment}
          customerId={customerId}
          onClose={() => setEditingPayment(null)}
          onSaved={() => {
            setEditingPayment(null);
            refetch();
            onCustomerChanged(); // تحديث رصيد العميل بدون reload كامل
          }}
        />
      )}
      
      <ConfirmDialog
        isOpen={!!deletingPayment}
        type="danger"
        title="حذف مدفوعة"
        message={deletingPayment ? 
          `هل أنت متأكد من حذف مدفوعة بمبلغ ${formatEGP(deletingPayment.amount)} ؟

سيتم:
• إرجاع المبلغ لرصيد العميل
• خصم المبلغ من الخزينة
• حذف سجل المدفوعة نهائياً

هذا الإجراء لا يمكن التراجع عنه!` : ''
        }
        confirmText="نعم، احذف"
        cancelText="إلغاء"
        onConfirm={confirmDeletePayment}
        onCancel={() => setDeletingPayment(null)}
      />
    </div>
  );
}

/* ============================================
   قسم فواتير العميل
============================================ */
function InvoicesSection({ customerId }: { customerId: string }) {
  const { data, loading } = useApi<{ items: Invoice[] }>(`/api/sales/invoices?customer_id=${customerId}&limit=200`);
  const invoices = data?.items || [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">🛒 فواتير العميل</h2>
      {loading ? <div className="card text-center py-8 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">رقم</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold">#{inv.invoice_number}</td>
                  <td className="p-3 text-xs">{formatDate(inv.invoice_date)}</td>
                  <td className="p-3 font-bold text-nazlawy-600">{formatEGP(inv.total)}</td>
                  <td className="p-3"><span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span></td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد فواتير</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================
   نموذج تعديل بيانات العميل
============================================ */
function EditForm({ customer, onClose, onSaved }: { customer: CustomerDetail; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: customer.name,
    phone: customer.phone || '',
    whatsapp: customer.whatsapp || '',
    address: customer.address || '',
    opening_balance: customer.opening_balance,
    route_days: customer.route_days || [],
    notes: customer.notes || '',
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم العميل مطلوب'); return; }
    const { error } = await mutate('PATCH', `/api/customers/${customer.id}`, {
      name: f.name.trim(),
      phone: f.phone || null,
      whatsapp: f.whatsapp || null,
      address: f.address || null,
      opening_balance: Number(f.opening_balance) || 0,
      route_days: f.route_days,
      notes: f.notes || null,
    });
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  function toggleDay(day: string) {
    setF(prev => ({
      ...prev,
      route_days: prev.route_days.includes(day) ? prev.route_days.filter(d => d !== day) : [...prev.route_days, day],
    }));
  }

  const DAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold">✏️ تعديل بيانات العميل</h2>
        <div><label className="text-sm font-medium block mb-1">اسم العميل *</label><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">الهاتف</label><input className="input-field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label className="text-sm font-medium block mb-1">واتساب</label><input className="input-field" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
        </div>
        <div><label className="text-sm font-medium block mb-1">العنوان</label><input className="input-field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div>
          <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي</label>
          <input type="number" step="0.01" className="input-field" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })} />
          <div className="text-xs text-gray-600 mt-2 bg-orange-50 border border-orange-200 rounded p-2">
            <span className="font-bold text-orange-800">⚠️ تنبيه:</span> تعديل الرصيد الافتتاحي يغيّر الرصيد الحالي تلقائياً بنفس القيمة (يُضاف الفرق للعميل أو يُخصم منه).<br/>
            <span className="text-red-700">موجب</span> = العميل مدين لك • <span className="text-green-700">سالب</span> = أنت مدين للعميل.
          </div>
        </div>

        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><textarea className="input-field" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

/* ============================================
   نموذج التحصيل السريع
============================================ */
function CollectForm({ customerId, onClose, onSaved }: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: 0, payment_method: 'نقدي', treasury_id: '', payment_date: '', notes: '' });
  const { mutate, loading } = useApiMutation();
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => setTreasuries(j.data?.items || [])).catch(() => {});
  }, []);

  async function save() {
    if (!f.treasury_id || f.amount <= 0) { alert('❌ أكمل البيانات'); return; }
    const { error } = await mutate('POST', '/api/payments/customers', { ...f, customer_id: customerId });
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h2 className="text-xl font-bold">+ تحصيل من العميل</h2>
        <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} autoFocus /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select className="input-field" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الخزينة *</label>
            <select className="input-field" value={f.treasury_id} onChange={(e) => setF({ ...f, treasury_id: e.target.value })}>
              <option value="">اختر...</option>
              {treasuries.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-sm font-medium block mb-1">التاريخ</label><input type="date" className="input-field" value={f.payment_date} onChange={(e) => setF({ ...f, payment_date: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}
/* ============================================
   نموذج تعديل مدفوعة عميل
============================================ */
function EditPaymentForm({ payment, customerId, onClose, onSaved }: { 
  payment: Payment; 
  customerId: string; 
  onClose: () => void; 
  onSaved: () => void 
}) {
  const [f, setF] = useState({
    amount: payment.amount,
    payment_method: payment.payment_method,
    treasury_id: payment.treasury?.id || '',
    payment_date: payment.payment_date.split('T')[0], // تحويل للتنسيق المطلوب للـ input
    notes: payment.notes || '',
  });
  const { mutate, loading } = useApiMutation();
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => setTreasuries(j.data?.items || [])).catch(() => {});
  }, []);

  async function save() {
    if (!f.treasury_id || f.amount <= 0) { alert('❌ أكمل البيانات'); return; }
    const { error } = await mutate('PATCH', `/api/payments/customers/${payment.id}`, f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h2 className="text-xl font-bold">✏️ تعديل المدفوعة</h2>
        <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} autoFocus /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select className="input-field" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الخزينة *</label>
            <select className="input-field" value={f.treasury_id} onChange={(e) => setF({ ...f, treasury_id: e.target.value })}>
              <option value="">اختر...</option>
              {treasuries.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-sm font-medium block mb-1">التاريخ</label><input type="date" className="input-field" value={f.payment_date} onChange={(e) => setF({ ...f, payment_date: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2">
          <span className="font-bold text-yellow-800">⚠️ تنبيه:</span> تعديل المدفوعة سيؤثر على رصيد العميل والخزينة تلقائياً.
        </div>
        <div className="flex gap-2 pt-3">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   نموذج إضافة سلفة / تسوية لحساب العميل
============================================ */
function CustomerAdjustmentModal({
  customerId,
  customerName,
  onClose,
  onSaved,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"debit" | "credit">("debit"); // debit = سلفة / إضافة عليه, credit = خصم منه / تسوية لصالحه
  const [amount, setAmount] = useState<string>("");
  const [adjustmentDate, setAdjustmentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/treasury")
      .then((r) => r.json())
      .then((j) => setTreasuries(j.data?.items || j.data || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) {
      alert("❌ يرجى إدخال مبلغ صحيح أكبر من الصفر");
      return;
    }
    if (!notes.trim()) {
      alert("❌ يرجى كتابة سبب / بيان العملية");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: num,
          type,
          adjustment_date: adjustmentDate,
          treasury_id: treasuryId || null,
          notes: notes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "فشل في تسجيل الحركة"));
        return;
      }
      alert("✅ تم تسجيل الحركة وتحديث رصيد العميل بنجاح");
      onSaved();
    } catch {
      alert("❌ حدث خطأ أثناء الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-scale-up">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span>💸</span>
            <span>سلفة / إضافة مبلغ للعميل ({customerName})</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* نوع الحركة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع الحركة *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("debit")}
                className={`p-2.5 rounded-xl border text-xs font-black flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  type === "debit"
                    ? "bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>🔴 إضافة عليه / سلفة</span>
                <span className="text-[10px] font-normal text-slate-500">(يزيد المبلغ المطلوب منه)</span>
              </button>
              <button
                type="button"
                onClick={() => setType("credit")}
                className={`p-2.5 rounded-xl border text-xs font-black flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  type === "credit"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>🟢 خصم منه / تسوية</span>
                <span className="text-[10px] font-normal text-slate-500">(ينقص المبلغ المطلوب منه)</span>
              </button>
            </div>
          </div>

          {/* المبلغ والتاريخ */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ (ج.م) *</label>
              <input
                type="number"
                step="any"
                min="1"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-black font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ *</label>
              <input
                type="date"
                value={adjustmentDate}
                onChange={(e) => setAdjustmentDate(e.target.value)}
                required
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* الخزينة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الخزينة {type === "debit" ? "(المصروف منها كاش)" : "(المودع بها كاش)"} (اختياري)
            </label>
            <select
              value={treasuryId}
              onChange={(e) => setTreasuryId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="">بدون تأثير على الخزينة (تسوية حساب ورقية)</option>
              {treasuries.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* البيان */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البيان / سبب العملية *</label>
            <input
              type="text"
              placeholder="مثال: سلفة نقدية شخصية، فرق حساب، مصاريف نقل..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? "جاري الحفظ..." : "تأكيد وتسجيل الحركة"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}