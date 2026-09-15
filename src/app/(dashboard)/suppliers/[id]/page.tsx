"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import SupplierPaymentReceiptModal from "@/components/SupplierPaymentReceiptModal";

interface SupplierDetail {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  balance: number;
  notes: string | null;
}
interface Payment {
  id: string; payment_date: string; amount: number; payment_method: string; notes: string | null;
  treasury_id?: string | null;
  treasury?: { id: string; name: string } | null;
}
interface PurchaseInvoice {
  id: string; purchase_number: number; purchase_date: string; total_amount: number; status: string;
  _count?: { items: number };
}
const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadSupplier = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/suppliers/${params.id}`);
        const json = await res.json();
        setSupplier(json?.data ?? null);
      } catch {
        setSupplier(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) load();
  }, [params.id, reloadKey]);

  if (loading) return <div className="card py-12 text-center text-gray-500">⏳ جاري التحميل...</div>;

  if (!supplier) {
    return <div className="space-y-4">
      <button onClick={() => router.back()} className="btn-secondary">↩️ العودة</button>
      <div className="card py-12 text-center text-gray-500">لا توجد بيانات لهذا المورد</div>
    </div>;
  }

  return (
    <div className="space-y-4">
      {/* رأس الصفحة */}
      <div className="space-y-2">
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 break-words">
          🏭 {supplier.name}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdjustment(true)}
            className="text-xs sm:text-sm font-bold px-3 py-2 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <span>💸</span>
            <span>تسوية / إضافة مبلغ</span>
          </button>
          <button
            onClick={() => window.open(`/print/statement/supplier/${supplier.id}`, '_blank')}
            className="text-xs sm:text-sm font-bold px-3 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-300 flex items-center gap-1 shadow-sm cursor-pointer"
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
            onClick={() => deleteSupplier(supplier, router)}
            className="text-xs sm:text-sm font-bold p-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 shadow-sm cursor-pointer"
            title="حذف"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* جدول بيانات المورد */}
      <div className="card p-0 overflow-hidden border border-slate-200">
        <table className="w-full text-xs sm:text-sm border-collapse">
          <tbody>
            <tr className="border-b bg-slate-50/50">
              <td className="p-2.5 font-bold text-gray-500 w-1/4 border-l">الهاتف:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800 font-mono">{supplier.phone || '—'}</td>
            </tr>
            <tr className="border-b">
              <td className="p-2.5 font-bold text-gray-500 border-l">رصيد افتتاحي:</td>
              <td className="p-2.5 font-bold font-mono text-slate-700 border-l">{formatEGP(supplier.opening_balance)} ج</td>
              <td className="p-2.5 font-bold text-gray-500 border-l">الرصيد الحالي:</td>
              <td className={`p-2.5 font-extrabold font-mono text-base ${Number(supplier.balance) > 0 ? 'text-red-700' : Number(supplier.balance) < 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                {formatEGP(supplier.balance)} ج
              </td>
            </tr>
            <tr className="border-b bg-slate-50/50">
              <td className="p-2.5 font-bold text-gray-500 border-l">العنوان:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800">{supplier.address || '—'}</td>
            </tr>
            <tr>
              <td className="p-2.5 font-bold text-gray-500 border-l">الملاحظات:</td>
              <td colSpan={3} className="p-2.5 font-semibold text-slate-800">{supplier.notes || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* قسم كشف الحساب */}
      <StatementSection
        supplierId={supplier.id}
        balance={Number(supplier.balance)}
        onPay={() => setShowPay(true)}
        onEditPayment={(p) => setEditingPayment(p)}
        onChanged={reloadSupplier}
      />

      {/* قسم فواتير المورد */}
      <InvoicesSection supplierId={supplier.id} />

      {showPay && (
        <PayForm supplierId={supplier.id} onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); reloadSupplier(); }} />
      )}
      {showAdjustment && (
        <SupplierAdjustmentModal supplierId={supplier.id} supplierName={supplier.name} onClose={() => setShowAdjustment(false)} onSaved={() => { setShowAdjustment(false); reloadSupplier(); }} />
      )}
      {editingPayment && (
        <PayForm
          supplierId={supplier.id}
          paymentToEdit={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => { setEditingPayment(null); reloadSupplier(); }}
        />
      )}
      {showEdit && (
        <EditForm supplier={supplier} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); reloadSupplier(); }} />
      )}
    </div>
  );
}

// حذف المورد (مع تأكيد الحذف الشامل للفواتير والمدفوعات إن وجدت)
async function deleteSupplier(supplier: SupplierDetail, router: ReturnType<typeof useRouter>) {
  if (!confirm(`هل تريد بالتأكيد حذف المورد "${supplier.name}"؟`)) return;

  const res = await fetch(`/api/suppliers/${supplier.id}`, { method: 'DELETE', cache: 'no-store' });
  const json = await res.json();

  if (!res.ok) {
    if (json?.requires_confirmation) {
      const confirmed = confirm(json.message);
      if (confirmed) {
        const forceRes = await fetch(`/api/suppliers/${supplier.id}?force=true`, { method: 'DELETE', cache: 'no-store' });
        const forceJson = await forceRes.json();
        if (!forceRes.ok) {
          alert('❌ ' + (forceJson?.error?.message || 'تعذّر حذف المورد'));
          return;
        }
        alert('✅ تم حذف المورد وجميع معاملاته وفواتيره بنجاح');
        router.push('/suppliers');
        return;
      }
      return;
    }
    alert('❌ ' + (json?.error?.message || json?.error?.code || 'تعذّر الحذف'));
    return;
  }

  alert('✅ تم حذف المورد بنجاح');
  router.push('/suppliers');
}

/* ============================================
   قسم كشف الحساب
============================================ */
function StatementSection({
  supplierId,
  balance,
  onPay,
  onEditPayment,
  onChanged,
}: {
  supplierId: string;
  balance: number;
  onPay: () => void;
  onEditPayment: (p: Payment) => void;
  onChanged: () => void;
}) {
  const { data, loading, refetch } = useApi<{ items: Payment[]; total_amount: number }>(`/api/payments/suppliers?supplier_id=${supplierId}&limit=9999`);
  const payments = data?.items || [];
  const totalPaid = data?.total_amount || 0;
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  async function handleDeletePayment(p: Payment) {
    if (!confirm(`⚠️ هل أنت متأكد من حذف سند السداد بمبلغ ${formatEGP(p.amount)} ج؟\n\nسيتم إرجاع المبلغ لرصيد الخزينة وتحديث المستحقات.`)) return;
    try {
      const res = await fetch(`/api/payments/suppliers/${p.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || json?.error?.code || "فشل في الحذف"));
        return;
      }
      alert("✅ تم حذف سند السداد وإرجاع المبلغ للخزينة وتحديث المستحقات");
      refetch();
      onChanged();
    } catch {
      alert("❌ حدث خطأ أثناء الحذف");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📋 كشف الحساب</h2>
        <button onClick={onPay} className="btn-primary text-sm">+ سداد جديد</button>
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
                <th className="p-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t hover:bg-purple-50/60 cursor-pointer transition-colors" onClick={() => setSelectedReceiptId(p.id)} title="اضغط لعرض إيصال السداد">
                  <td className="p-3 text-xs">{formatDate(p.payment_date)}</td>
                  <td className="p-3 text-xs text-gray-600">{p.treasury?.name || '—'}</td>
                  <td className="p-3 text-xs">{p.payment_method}</td>
                  <td className="p-3">{p.notes || 'سداد لمورد'}</td>
                  <td className="p-3 font-mono font-bold text-red-700">{formatEGP(p.amount)}</td>
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setSelectedReceiptId(p.id)}
                        className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 font-bold cursor-pointer"
                        title="إيصال السداد"
                      >
                        💳 إيصال
                      </button>
                      <button
                        onClick={() => onEditPayment(p)}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-bold cursor-pointer"
                        title="تعديل السداد"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeletePayment(p)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded font-bold cursor-pointer"
                        title="حذف السداد"
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
                  <td colSpan={4} className="p-3 text-left">الإجمالي:</td>
                  <td className="p-3 font-mono text-red-700">{formatEGP(totalPaid)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {selectedReceiptId && (
        <SupplierPaymentReceiptModal paymentId={selectedReceiptId} onClose={() => setSelectedReceiptId(null)} />
      )}
    </div>
  );
}

/* ============================================
   قسم فواتير المورد
============================================ */
function InvoicesSection({ supplierId }: { supplierId: string }) {
  const { data, loading } = useApi<{ items: PurchaseInvoice[] }>(`/api/purchases/invoices?supplier_id=${supplierId}`);
  const invoices = data?.items || [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">📥 فواتير المورد</h2>
      {loading ? <div className="card text-center py-8 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">رقم</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الأصناف</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold">#{inv.purchase_number}</td>
                  <td className="p-3 text-xs">{formatDate(inv.purchase_date)}</td>
                  <td className="p-3 text-center">{inv._count?.items ?? 0}</td>
                  <td className="p-3 font-mono font-bold">{formatEGP(inv.total_amount)}</td>
                  <td className="p-3"><span className="badge bg-green-100 text-green-800">{inv.status}</span></td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد فواتير</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================
   نموذج السداد وتعديل السداد
============================================ */
function PayForm({
  supplierId,
  onClose,
  onSaved,
  paymentToEdit,
}: {
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
  paymentToEdit?: Payment | null;
}) {
  const isEditing = !!paymentToEdit;
  const [f, setF] = useState({
    amount: paymentToEdit?.amount || 0,
    payment_method: paymentToEdit?.payment_method || 'نقدي',
    treasury_id: paymentToEdit?.treasury_id || paymentToEdit?.treasury?.id || '',
    payment_date: paymentToEdit?.payment_date
      ? new Date(paymentToEdit.payment_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    notes: paymentToEdit?.notes || '',
  });
  const { mutate, loading } = useApiMutation();
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => {
      const items = j.data?.items || [];
      setTreasuries(items);
      if (items.length > 0 && !f.treasury_id) {
        setF(prev => ({ ...prev, treasury_id: items[0].id }));
      }
    }).catch(() => {});
  }, []);

  async function save() {
    if (!f.treasury_id || f.amount <= 0) { alert('❌ أكمل البيانات'); return; }

    const url = isEditing ? `/api/payments/suppliers/${paymentToEdit.id}` : '/api/payments/suppliers';
    const method = isEditing ? 'PATCH' : 'POST';

    const { error } = await mutate(method, url, { ...f, supplier_id: supplierId });
    if (error) { alert('❌ ' + error); return; }
    alert(isEditing ? '✅ تم تعديل سند السداد بنجاح' : '✅ تم حفظ سند السداد بنجاح');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h2 className="text-xl font-bold">{isEditing ? '✏️ تعديل سداد لمورد' : '+ سداد للمورد'}</h2>
        <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field font-bold font-mono text-red-700" value={f.amount === 0 ? '' : f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="flex gap-2 pt-3">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : isEditing ? 'تعديل السداد' : 'حفظ'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   نموذج تعديل بيانات المورد
============================================ */
function EditForm({ supplier, onClose, onSaved }: { supplier: SupplierDetail; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: supplier.name,
    phone: supplier.phone || '',
    address: supplier.address || '',
    opening_balance: supplier.opening_balance,
    notes: supplier.notes || '',
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم المورد مطلوب'); return; }
    const { error } = await mutate('PATCH', `/api/suppliers/${supplier.id}`, {
      name: f.name.trim(),
      phone: f.phone || null,
      address: f.address || null,
      opening_balance: Number(f.opening_balance) || 0,
      notes: f.notes || null,
    });
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h2 className="text-xl font-bold">✏️ تعديل بيانات المورد</h2>
        <div><label className="text-sm font-medium block mb-1">اسم المورد *</label><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label className="text-sm font-medium block mb-1">الهاتف</label><input className="input-field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">العنوان</label><input className="input-field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div>
          <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي</label>
          <input type="number" step="0.01" className="input-field" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })} />
          <p className="text-xs text-orange-600 mt-1">⚠️ تعديل الرصيد الافتتاحي يغيّر الرصيد الحالي مباشرة</p>
        </div>
        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><textarea className="input-field" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

/* ============================================
   نموذج إضافة تسوية / سلفة لحساب المورد
============================================ */
function SupplierAdjustmentModal({
  supplierId,
  supplierName,
  onClose,
  onSaved,
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"credit" | "debit">("credit"); // credit = إضافة له / مستحق للمورد, debit = خصم منه / استرداد/سلفة
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
      const res = await fetch(`/api/suppliers/${supplierId}/adjustments`, {
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
      alert("✅ تم تسجيل الحركة وتحديث رصيد المورد بنجاح");
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
            <span>تسوية / إضافة مبلغ للمورد ({supplierName})</span>
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
                onClick={() => setType("credit")}
                className={`p-2.5 rounded-xl border text-xs font-black flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  type === "credit"
                    ? "bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>🔴 إضافة له (مستحق للمورد)</span>
                <span className="text-[10px] font-normal text-slate-500">(يزيد المبلغ المستحق له)</span>
              </button>
              <button
                type="button"
                onClick={() => setType("debit")}
                className={`p-2.5 rounded-xl border text-xs font-black flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  type === "debit"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>🟢 خصم منه / استرداد</span>
                <span className="text-[10px] font-normal text-slate-500">(ينقص المبلغ المستحق له)</span>
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
              الخزينة {type === "credit" ? "(المصروف منها كاش للمورد)" : "(المسترد إليها كاش من المورد)"} (اختياري)
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
              placeholder="مثال: سلفة نقدية للمورد، تسوية فرق بضاعة، مصاريف نقل..."
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
