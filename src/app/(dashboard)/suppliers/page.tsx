"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import Pagination from "@/components/Pagination";
import SupplierPaymentReceiptModal from "@/components/SupplierPaymentReceiptModal";

/* ============================================
   أنواع مشتركة
============================================ */
interface Supplier {
  id: string; name: string; phone: string | null; balance: number; opening_balance: number;
  address?: string | null;
}
interface Payment {
  id: string; payment_date: string; amount: number; payment_method: string; notes: string | null;
  treasury_id?: string | null;
  supplier?: { id: string; name: string; phone: string | null } | null;
  treasury?: { id: string; name: string } | null;
}

const TABS = [
  { key: 'suppliers', label: 'الموردين', icon: '🏭' },
  { key: 'payments', label: 'السداد', icon: '💸' },
] as const;
type TabKey = typeof TABS[number]['key'];

const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function SuppliersPage() {
  const [tab, setTab] = useState<TabKey>('suppliers');

  return (
    <div className="space-y-4">
      {/* شريط التبويبات */}
      <div className="flex gap-2 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px cursor-pointer ${
              tab === t.key ? 'border-elnesr-500 text-elnesr-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'payments' && <PaymentsTab />}
    </div>
  );
}

/* ============================================
   تبويب الموردين
============================================ */
function SuppliersTab() {
  const [search, setSearch] = useState("");
  const [show, setShow] = useState(false);
  const [page, setPage] = useState(1);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading, refetch } = useApi<{ items: Supplier[]; total: number; limit: number; page: number }>(
    `/api/suppliers?search=${encodeURIComponent(search)}&limit=50&page=${page}`
  );

  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) setPage(parseInt(pageParam));
  }, [searchParams]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 w-full">
        <button
          onClick={() => setShow(true)}
          className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm px-2.5 sm:px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <span>➕</span>
          <span>مورد جديد</span>
        </button>
        <a
          href="/print/statement/all-suppliers"
          target="_blank"
          className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm px-2.5 sm:px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer border border-slate-700 whitespace-nowrap"
        >
          <span>📑</span>
          <span>كشف حساب مجمع</span>
        </a>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الهاتف..." className="input-field md:flex-1" autoFocus />
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile: كاردات */}
          <div className="space-y-2 md:hidden">
            {data?.items.map(s => (
              <div
                key={s.id}
                onClick={() => router.push(`/suppliers/${s.id}`)}
                className="card p-3 cursor-pointer hover:border-elnesr-500 hover:shadow-md transition-all"
              >
                <div className="font-bold text-sm truncate mb-1">{s.name}</div>
                <div className="text-xs text-gray-500 font-mono mb-1.5">{s.phone || '—'}</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">الرصيد:</span>
                  <span className={`font-bold font-mono ${s.balance > 0.01 ? 'text-red-700' : s.balance < -0.01 ? 'text-blue-700' : 'text-green-700'}`}>
                    {formatEGP(s.balance)} ج
                  </span>
                </div>
              </div>
            ))}
            {data?.items.length === 0 && (
              <div className="card text-center py-12 text-gray-400">لا يوجد موردين</div>
            )}
          </div>

          {/* Desktop: جدول */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-right">الاسم</th>
                  <th className="p-3 text-right">الهاتف</th>
                  <th className="p-3 text-right">رصيد سابق</th>
                  <th className="p-3 text-right">الرصيد الحالي</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(s => (
                  <tr key={s.id} onClick={() => router.push(`/suppliers/${s.id}`)} className="border-t hover:bg-gray-50 cursor-pointer transition-colors hover:text-elnesr-600">
                    <td className="p-3 font-semibold">{s.name}</td>
                    <td className="p-3 text-sm font-mono">{s.phone || '—'}</td>
                    <td className="p-3 font-mono text-xs">{formatEGP(s.opening_balance)}</td>
                    <td className="p-3 font-mono font-bold">{formatEGP(s.balance)}</td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-gray-400">لا يوجد موردين</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && data.total > 0 && (
        <Pagination
          total={data.total}
          page={data.page}
          pageSize={data.limit}
          baseUrl="/suppliers"
        />
      )}

      {show && <SupplierForm onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); }} />}
    </div>
  );
}

function SupplierForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', address: '', opening_balance: 0 });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم المورد مطلوب'); return; }
    const { error } = await mutate('POST', '/api/suppliers', f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
        <h2 className="text-xl font-bold">+ إضافة مورد</h2>
        <div><label className="text-sm font-medium block mb-1">الاسم *</label><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label className="text-sm font-medium block mb-1">الهاتف</label><input className="input-field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">العنوان</label><input className="input-field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div>
          <label className="text-sm font-medium block mb-1">رصيد سابق (مستحق للمورد)</label>
          <input type="number" step="0.01" className="input-field" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })} />
          <div className="text-xs text-gray-600 mt-2 bg-blue-50 border border-blue-100 rounded p-2 leading-relaxed">
            <div className="font-bold text-blue-800 mb-1">💡 شرح الرصيد الافتتاحي:</div>
            <div>• <strong>بالموجب</strong> (مثلاً 1000): المورد له <span className="text-red-700 font-bold">مستحقات</span> عليك (أنت مدين له / لم تسدد له).</div>
            <div>• <strong>بالسالب</strong> (مثلاً -500): رصيد <span className="text-green-700 font-bold">دائن</span> لك (المورد مدين لك / دفعت له مقدماً).</div>
            <div>• <strong>صفر</strong>: حساب جديد لا يوجد عليه رصيد سابق.</div>
          </div>
        </div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading || !f.name} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

/* ============================================
   تبويب السداد
============================================ */
function PaymentsTab() {
  const [show, setShow] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const { data, loading, refetch } = useApi<{ items: Payment[]; total: number; total_amount: number }>("/api/payments/suppliers?limit=500");

  const filteredItems = (data?.items || []).filter(p => {
    const matchSearch = !search.trim() || (p.supplier?.name && p.supplier.name.toLowerCase().includes(search.toLowerCase())) || (p.notes && p.notes.includes(search));
    const matchMethod = !methodFilter || p.payment_method === methodFilter;
    return matchSearch && matchMethod;
  });

  const totalFilteredAmount = filteredItems.reduce((s, p) => s + Number(p.amount), 0);

  async function handleDelete(p: Payment, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`⚠️ هل أنت متأكد من حذف سند السداد بمبلغ ${formatEGP(p.amount)} ج للمورد "${p.supplier?.name || 'غير محدد'}"؟\n\nسيتم إرجاع المبلغ لرصيد الخزينة وتحديث مستحقات المورد.`)) return;
    try {
      const res = await fetch(`/api/payments/suppliers/${p.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || json?.error?.code || "فشل في الحذف"));
        return;
      }
      alert("✅ تم حذف سند السداد وإرجاع المبلغ للخزينة وتحديث مستحقات المورد");
      refetch();
    } catch {
      alert("❌ حدث خطأ أثناء الحذف");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{filteredItems.length} سداد • إجمالي: {formatEGP(totalFilteredAmount)} جنيه</p>
        <button onClick={() => setShow(true)} className="btn-primary">+ سداد جديد</button>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 ابحث بالاسم أو الملاحظات..."
          className="input-field md:flex-1"
        />
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="input-field md:w-56"
        >
          <option value="">كل طرق الدفع</option>
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">المورد</th>
                <th className="p-3 text-right">الخزينة</th>
                <th className="p-3 text-right">طريقة الدفع</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-right">ملاحظات</th>
                <th className="p-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedReceiptId(p.id)}
                  className="border-t hover:bg-purple-50/60 cursor-pointer transition-colors"
                  title="اضغط لعرض إيصال السداد ومشاركته عبر الواتساب"
                >
                  <td className="p-3 text-xs">{formatDate(p.payment_date)}</td>
                  <td className="p-3 font-semibold text-slate-800">{p.supplier?.name || '—'}</td>
                  <td className="p-3 text-xs text-gray-600">{p.treasury?.name || '—'}</td>
                  <td className="p-3 text-xs">{p.payment_method}</td>
                  <td className="p-3 font-mono font-bold text-red-700">{formatEGP(p.amount)}</td>
                  <td className="p-3 text-xs text-gray-500">{p.notes || '—'}</td>
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
                        onClick={(e) => { e.stopPropagation(); setEditingPayment(p); }}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-bold cursor-pointer"
                        title="تعديل"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => handleDelete(p, e)}
                        className="text-xs px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded font-bold cursor-pointer"
                        title="حذف سند السداد"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-gray-400">لا توجد مدفوعات مطابقة</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {show && <PaymentForm onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); }} />}
      {editingPayment && (
        <PaymentForm
          paymentToEdit={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => { setEditingPayment(null); refetch(); }}
        />
      )}
      {selectedReceiptId && (
        <SupplierPaymentReceiptModal paymentId={selectedReceiptId} onClose={() => setSelectedReceiptId(null)} />
      )}
    </div>
  );
}

function PaymentForm({
  onClose,
  onSaved,
  paymentToEdit,
}: {
  onClose: () => void;
  onSaved: () => void;
  paymentToEdit?: Payment | null;
}) {
  const isEditing = !!paymentToEdit;
  const [f, setF] = useState({
    supplier_id: paymentToEdit?.supplier?.id || '',
    amount: paymentToEdit?.amount || 0,
    payment_method: paymentToEdit?.payment_method || 'نقدي',
    treasury_id: paymentToEdit?.treasury_id || paymentToEdit?.treasury?.id || '',
    payment_date: paymentToEdit?.payment_date
      ? new Date(paymentToEdit.payment_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    notes: paymentToEdit?.notes || '',
  });
  const { mutate, loading } = useApiMutation();
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);
  const [supSearch, setSupSearch] = useState("");

  useEffect(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => {
      const items = j.data?.items || [];
      setTreasuries(items);
      if (items.length > 0 && !f.treasury_id) {
        setF(prev => ({ ...prev, treasury_id: items[0].id }));
      }
    }).catch(() => {});
    fetch('/api/suppliers?limit=5000').then(r => r.json()).then(j => setSuppliers(j.data?.items || [])).catch(() => {});
  }, []);

  const filtered = suppliers.filter(s => s.name.includes(supSearch)).slice(0, 50);

  async function save() {
    if (!f.supplier_id || !f.treasury_id || f.amount <= 0) { alert('❌ أكمل البيانات'); return; }
    
    const url = isEditing ? `/api/payments/suppliers/${paymentToEdit.id}` : '/api/payments/suppliers';
    const method = isEditing ? 'PATCH' : 'POST';

    const { error } = await mutate(method, url, f);
    if (error) { alert('❌ ' + error); return; }
    alert(isEditing ? '✅ تم تحديث سند السداد بنجاح' : '✅ تم حفظ سند السداد بنجاح');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
        <h2 className="text-xl font-bold">{isEditing ? '✏️ تعديل سند سداد لمورد' : '+ سداد لمورد'}</h2>
        
        {isEditing && paymentToEdit?.supplier?.name ? (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
            <span className="text-xs text-purple-800 font-semibold block mb-0.5">المورد المحدد:</span>
            <span className="font-extrabold text-purple-950 text-sm">{paymentToEdit.supplier.name}</span>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium block mb-1">المورد *</label>
            <input className="input-field" placeholder="🔍 ابحث عن مورد..." value={supSearch} onChange={(e) => setSupSearch(e.target.value)} autoFocus />
            <select className="input-field mt-1" value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })} size={4}>
              {filtered.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field font-bold font-mono text-red-700" value={f.amount === 0 ? '' : f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} /></div>
          <div>
            <label className="text-sm font-medium block mb-1">طريقة الدفع</label>
            <select className="input-field" value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الخزينة *</label>
            <select className="input-field" value={f.treasury_id} onChange={(e) => setF({ ...f, treasury_id: e.target.value })}>
              <option value="">اختر...</option>
              {treasuries.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="text-sm font-medium block mb-1">التاريخ</label><input type="date" className="input-field" value={f.payment_date} onChange={(e) => setF({ ...f, payment_date: e.target.value })} /></div>
        </div>

        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>

        <div className="flex gap-2 pt-3">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : isEditing ? 'تعديل السداد' : 'حفظ'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
