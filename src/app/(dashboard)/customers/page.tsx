"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import Pagination from "@/components/Pagination";
import PaymentReceiptModal from "@/components/PaymentReceiptModal";
import CustomerStatementModal from "@/components/CustomerStatementModal";
import CustomerAdjustmentReceiptModal from "@/components/CustomerAdjustmentReceiptModal";
import CustomerAdjustmentModal from "@/components/CustomerAdjustmentModal";

/* ============================================
   أنواع مشتركة
============================================ */
interface Customer {
  id: string; name: string; phone: string | null; balance: number; opening_balance: number;
  whatsapp?: string | null; address?: string | null; route_days?: string[];
}
interface Payment {
  id: string; payment_date: string; amount: number; payment_method: string; notes: string | null;
  customer?: { id: string; name: string; phone: string | null } | null;
  treasury?: { id: string; name: string } | null;
}

const TABS = [
  { key: 'customers', label: 'العملاء', icon: '👥' },
  { key: 'collections', label: 'التحصيلات', icon: '💰' },
] as const;
type TabKey = typeof TABS[number]['key'];

const DAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const METHODS = ["نقدي", "إنستاباي", "فودافون كاش", "تحويل بنكي", "شيك"];

export default function CustomersPage() {
  const [tab, setTab] = useState<TabKey>('customers');

  return (
    <div className="space-y-4">
      {/* شريط التبويبات */}
      <div className="flex gap-2 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px ${
              tab === t.key ? 'border-nazlawy-500 text-nazlawy-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'customers' && <CustomersTab />}
      {tab === 'collections' && <CollectionsTab />}
    </div>
  );
}

/* ============================================
   تبويب العملاء
============================================ */
function CustomersTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [show, setShow] = useState(false);
  const [selectedStatementCustomerId, setSelectedStatementCustomerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading, refetch } = useApi<{ items: Customer[]; total: number; limit: number; page: number }>(
    `/api/customers?search=${encodeURIComponent(search)}&limit=50&page=${page}`
  );

  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) setPage(parseInt(pageParam));
  }, [searchParams]);

  const visibleCustomers = (data?.items ?? []).filter((c) => {
    const status = c.balance > 0.01 ? 'unpaid' : c.balance < -0.01 ? 'overpaid' : 'cleared';
    if (statusFilter === 'all') return true;
    return status === statusFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 w-full">
        <button
          onClick={() => setShow(true)}
          className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm px-2.5 sm:px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <span>➕</span>
          <span>عميل جديد</span>
        </button>
        <a
          href="/print/statement/all-customers"
          target="_blank"
          className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm px-2.5 sm:px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer border border-slate-700 whitespace-nowrap"
        >
          <span>📑</span>
          <span>كشف حساب مجمع</span>
        </a>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الهاتف..." className="input-field md:flex-1" autoFocus />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field md:w-56">
          <option value="all">كل الحالات</option>
          <option value="unpaid">لم يتم السداد</option>
          <option value="overpaid">مدفوعات زائدة</option>
          <option value="cleared">حساب خالص</option>
        </select>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile: كاردات */}
          <div className="space-y-2 md:hidden">
            {visibleCustomers.map(c => {
              const status = c.balance > 0.01 ? 'لم يتم السداد' : c.balance < -0.01 ? 'مدفوعات زائدة' : 'حساب خالص';
              const statusClass = c.balance > 0.01 ? 'bg-red-100 text-red-800' : c.balance < -0.01 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
              return (
                <div
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className="card p-3 cursor-pointer hover:border-nazlawy-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="font-bold text-sm truncate flex-1">{c.name}</div>
                    <span className={`badge ${statusClass} shrink-0 mr-2`}>{status}</span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono mb-1.5">{c.phone || '—'}</div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">الرصيد:</span>
                    <span className={`font-bold font-mono ${c.balance > 0.01 ? 'text-red-700' : c.balance < -0.01 ? 'text-blue-700' : 'text-green-700'}`}>
                      {formatEGP(c.balance)} ج
                    </span>
                  </div>
                </div>
              );
            })}
            {visibleCustomers.length === 0 && (
              <div className="card text-center py-12 text-gray-400">لا يوجد عملاء</div>
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
                  <th className="p-3 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map(c => {
                  const status = c.balance > 0.01 ? 'لم يتم السداد' : c.balance < -0.01 ? 'مدفوعات زائدة' : 'حساب خالص';
                  const statusClass = c.balance > 0.01 ? 'bg-red-100 text-red-800' : c.balance < -0.01 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
                  return (
                    <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="border-t hover:bg-gray-50 cursor-pointer transition-colors hover:text-nazlawy-600">
                      <td className="p-3 font-semibold">{c.name}</td>
                      <td className="p-3 text-sm font-mono">{c.phone || '—'}</td>
                      <td className="p-3 font-mono text-xs">{formatEGP(c.opening_balance)}</td>
                      <td className="p-3 font-mono font-bold">{formatEGP(c.balance)}</td>
                      <td className="p-3"><span className={`badge ${statusClass}`}>{status}</span></td>
                    </tr>
                  );
                })}
                {visibleCustomers.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-gray-400">لا يوجد عملاء</td></tr>}
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
          baseUrl="/customers"
        />
      )}

      {show && <CustomerForm onClose={() => setShow(false)} onSaved={() => { setShow(false); refetch(); }} />}

      {selectedStatementCustomerId && (
        <CustomerStatementModal customerId={selectedStatementCustomerId} onClose={() => setSelectedStatementCustomerId(null)} />
      )}
    </div>
  );
}

function CustomerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', whatsapp: '', address: '', opening_balance: 0, route_days: [] as string[], notes: '' });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم العميل مطلوب'); return; }
    const { error } = await mutate('POST', '/api/customers', f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  function toggleDay(day: string) {
    setF(prev => ({
      ...prev,
      route_days: prev.route_days.includes(day) ? prev.route_days.filter(d => d !== day) : [...prev.route_days, day],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold">+ إضافة عميل</h2>
        <div><label className="text-sm font-medium block mb-1">الاسم *</label><input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label className="text-sm font-medium block mb-1">الهاتف</label><input className="input-field" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">واتساب</label><input className="input-field" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
        <div><label className="text-sm font-medium block mb-1">العنوان</label><input className="input-field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div>
          <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي</label>
          <input type="number" step="0.01" className="input-field" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })} />
          <div className="text-xs text-gray-600 mt-2 bg-blue-50 border border-blue-100 rounded p-2 leading-relaxed">
            <div className="font-bold text-blue-800 mb-1">💡 شرح الرصيد الافتتاحي:</div>
            <div>• <strong>بالموجب</strong> (مثلاً 1000): العميل <span className="text-red-700 font-bold">مدين</span> لك بهذا المبلغ (عنده دين عليك ما دفعه).</div>
            <div>• <strong>بالسالب</strong> (مثلاً -500): رصيد <span className="text-green-700 font-bold">دائن</span> للعميل (أنت مدين له / دفع مقدماً).</div>
            <div>• <strong>صفر</strong>: حساب جديد لا يوجد عليه رصيد سابق.</div>
          </div>
        </div>

        <div><label className="text-sm font-medium block mb-1">ملاحظات</label><textarea className="input-field" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading || !f.name} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}

/* ============================================
   تبويب خط السير
============================================ */
function RouteTab() {
  const [selectedDay, setSelectedDay] = useState("");
  const { data, loading } = useApi<{ items: Customer[]; total: number }>("/api/customers?limit=9999");

  const customers = (data?.items || []).filter(c => c.route_days && c.route_days.length > 0);
  const filtered = selectedDay ? customers.filter(c => c.route_days!.includes(selectedDay)) : customers;

  const byDay = DAYS.map(day => ({
    day,
    customers: customers.filter(c => c.route_days!.includes(day)),
  }));

  const totalDebt = filtered.reduce((s, c) => s + Number(c.balance), 0);
  const withoutRoute = (data?.items || []).filter(c => !c.route_days || c.route_days.length === 0).length;

  return (
    <div className="space-y-4">
      {/* كروت الأيام */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {byDay.map(({ day, customers: dayCustomers }) => {
          const dayDebt = dayCustomers.reduce((s, c) => s + Number(c.balance), 0);
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(selectedDay === day ? "" : day)}
              className={`card p-3 text-center transition-all ${selectedDay === day ? "ring-2 ring-nazlawy-500 bg-nazlawy-50" : "hover:shadow-md"}`}
            >
              <div className="text-sm font-bold text-slate-650">{day}</div>
              <div className="text-xs text-gray-500">{dayCustomers.length} عميل</div>
              <div className="text-xs font-mono mt-1 text-orange-700">{formatEGP(dayDebt)}</div>
            </button>
          );
        })}
      </div>

      {/* عملاء بدون مسار */}
      {withoutRoute > 0 && (
        <div className="card p-4 bg-yellow-50 border border-yellow-200">
          <div className="text-sm text-yellow-800">⚠️ {withoutRoute} عميل بدون أيام زيارة محددة</div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">{selectedDay ? `عملاء ${selectedDay}` : "كل العملاء بخط سير"}</h2>
          <p className="text-sm text-gray-500">{filtered.length} عميل • إجمالي ديون: {formatEGP(totalDebt)} جنيه</p>
        </div>
        {selectedDay && <button onClick={() => setSelectedDay("")} className="btn-secondary">إظهار الكل</button>}
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-right">الهاتف</th>
                <th className="p-3 text-right">العنوان</th>
                <th className="p-3 text-right">أيام الزيارة</th>
                <th className="p-3 text-right">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-semibold">{c.name}</td>
                  <td className="p-3 text-xs font-mono">
                    {c.phone && <a href={`tel:${c.phone}`} className="text-nazlawy-600 hover:underline">{c.phone}</a>}
                    {!c.phone && "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{c.address || '—'}</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.route_days!.map(d => (
                        <span key={d} className={`badge text-xs ${d === selectedDay ? "bg-nazlawy-100 text-nazlawy-800" : "bg-gray-100"}`}>{d}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 font-mono font-bold text-red-700">{formatEGP(c.balance)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-gray-400">لا يوجد عملاء</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================
   تبويب التحصيلات والسلف
============================================ */
interface AdjustmentRow {
  id: string;
  adjustment_date: string;
  amount: number;
  type: string;
  treasury?: { id: string; name: string } | null;
  notes: string | null;
  creator_name?: string | null;
  customer?: { id: string; name: string; phone: string | null } | null;
}

type UnifiedCollectionItem =
  | { kind: "payment"; id: string; date: string; amount: number; methodOrType: string; notes: string | null; customer?: { id: string; name: string; phone: string | null } | null; treasury?: { id: string; name: string } | null; raw: Payment }
  | { kind: "adjustment"; id: string; date: string; amount: number; methodOrType: string; notes: string | null; isDebit: boolean; customer?: { id: string; name: string; phone: string | null } | null; treasury?: { id: string; name: string } | null; raw: AdjustmentRow };

function CollectionsTab() {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "payment" | "advance">("all");
  const [selectedPaymentReceiptId, setSelectedPaymentReceiptId] = useState<string | null>(null);
  const [selectedAdjustmentReceiptId, setSelectedAdjustmentReceiptId] = useState<string | null>(null);

  const { data: paymentsData, loading: paymentsLoading, refetch: refetchPayments } = useApi<{ items: Payment[]; total: number; total_amount: number }>("/api/payments/customers?limit=500");
  const { data: adjustmentsData, loading: adjustmentsLoading, refetch: refetchAdjustments } = useApi<{ items: AdjustmentRow[]; total: number; total_debit: number; total_credit: number }>("/api/customers/adjustments?limit=500");

  const payments = paymentsData?.items || [];
  const adjustments = adjustmentsData?.items || [];

  const totalPaymentsAmount = paymentsData?.total_amount || 0;
  const totalAdvancesAmount = adjustmentsData?.total_debit || 0;
  const totalNet = totalPaymentsAmount - totalAdvancesAmount;

  // Build unified chronological list
  const unifiedItems: UnifiedCollectionItem[] = [
    ...payments.map((p): UnifiedCollectionItem => ({
      kind: "payment",
      id: p.id,
      date: p.payment_date,
      amount: Number(p.amount),
      methodOrType: p.payment_method,
      notes: p.notes,
      customer: p.customer,
      treasury: p.treasury,
      raw: p,
    })),
    ...adjustments.map((a): UnifiedCollectionItem => ({
      kind: "adjustment",
      id: a.id,
      date: a.adjustment_date,
      amount: Number(a.amount),
      methodOrType: a.type === "debit" ? "سلفة نقدية" : "تسوية رصيد",
      notes: a.notes,
      isDebit: a.type === "debit",
      customer: a.customer,
      treasury: a.treasury,
      raw: a,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredItems = unifiedItems.filter((item) => {
    if (typeFilter === "payment" && item.kind !== "payment") return false;
    if (typeFilter === "advance" && item.kind !== "adjustment") return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const matchName = item.customer?.name?.toLowerCase().includes(q);
    const matchPhone = item.customer?.phone?.includes(q);
    const matchNotes = item.notes?.toLowerCase().includes(q);
    const matchTreasury = item.treasury?.name?.toLowerCase().includes(q);
    return matchName || matchPhone || matchNotes || matchTreasury;
  });

  async function handleDeletePayment(p: Payment, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`⚠️ هل أنت متأكد من حذف سند التحصيل بمبلغ ${formatEGP(p.amount)} ج للعميل "${p.customer?.name || 'غير محدد'}"؟\n\nسيتم إرجاع المبلغ لرصيد العميل وتخصيمه من الخزينة.`)) return;
    try {
      const res = await fetch(`/api/payments/customers/${p.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || json?.error?.code || "فشل في الحذف"));
        return;
      }
      alert("✅ تم حذف سند التحصيل وإرجاع المبلغ لرصيد العميل وتحديث الخزينة");
      refetchPayments();
    } catch {
      alert("❌ حدث خطأ أثناء الحذف");
    }
  }

  async function handleDeleteAdjustment(a: AdjustmentRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`⚠️ هل أنت متأكد من حذف ${a.type === 'debit' ? 'سلفة' : 'تسوية'} بمبلغ ${formatEGP(a.amount)} ج للعميل "${a.customer?.name || 'غير محدد'}"؟\n\nسيتم التراجع عن التأثير في رصيد العميل والخزينة.`)) return;
    try {
      const res = await fetch(`/api/customers/adjustments/${a.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "فشل في حذف السلفة"));
        return;
      }
      alert("✅ تم حذف السلفة وإعادة ضبط الرصيد بنجاح");
      refetchAdjustments();
    } catch {
      alert("❌ حدث خطأ أثناء الحذف");
    }
  }

  const loading = paymentsLoading || adjustmentsLoading;

  return (
    <div className="space-y-4">
      {/* Top summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-xs font-bold text-emerald-800 block mb-1">💰 إجمالي التحصيلات (المستلم)</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
            {formatEGP(totalPaymentsAmount)} <span className="text-xs font-normal">ج.م</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">{payments.length} حركة تحصيل</span>
        </div>

        <div className="card p-4 border border-amber-100 bg-gradient-to-br from-amber-50/50 to-white">
          <span className="text-xs font-bold text-amber-800 block mb-1">💸 إجمالي السلف المنصرفة</span>
          <div className="text-xl sm:text-2xl font-black text-amber-700 font-mono">
            {formatEGP(totalAdvancesAmount)} <span className="text-xs font-normal">ج.م</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">{adjustments.length} حركة سلفة / تسوية</span>
        </div>

        <div className="card p-4 border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <span className="text-xs font-bold text-slate-700 block mb-1">📊 صافي السيولة المحصلة</span>
          <div className={`text-xl sm:text-2xl font-black font-mono ${totalNet >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
            {formatEGP(totalNet)} <span className="text-xs font-normal">ج.م</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">(التحصيلات − السلف)</span>
        </div>
      </div>

      {/* Header buttons and Filter pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTypeFilter("all")}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              typeFilter === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            الكل ({unifiedItems.length})
          </button>
          <button
            onClick={() => setTypeFilter("payment")}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              typeFilter === "payment"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            💰 التحصيلات فقط ({payments.length})
          </button>
          <button
            onClick={() => setTypeFilter("advance")}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              typeFilter === "advance"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            💸 السلف والتسويات فقط ({adjustments.length})
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPaymentModal(true)}
            className="btn-primary text-xs sm:text-sm py-2 px-3.5 shadow-sm"
          >
            + تحصيل جديد
          </button>
          <button
            onClick={() => setShowAdvanceModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs sm:text-sm transition-all shadow-sm cursor-pointer hover:scale-[1.02]"
          >
            + سلفة لعميل 💸
          </button>
        </div>
      </div>

      {/* Search Field */}
      <div className="card p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 ابحث باسم العميل أو رقم الهاتف أو الملاحظات أو الخزينة..."
          className="input-field"
        />
      </div>

      {/* Unified Table */}
      {loading ? (
        <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">العميل</th>
                <th className="p-3 text-right">نوع الحركة</th>
                <th className="p-3 text-right">الخزينة</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-right">البيان / ملاحظات</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isPay = item.kind === "payment";
                const isDebit = !isPay && (item as any).isDebit;

                return (
                  <tr
                    key={`${item.kind}-${item.id}`}
                    onClick={() => {
                      if (isPay) {
                        setSelectedPaymentReceiptId(item.id);
                      } else {
                        setSelectedAdjustmentReceiptId(item.id);
                      }
                    }}
                    className={`border-t transition-colors cursor-pointer ${
                      isPay ? "hover:bg-emerald-50/50" : "hover:bg-amber-50/50"
                    }`}
                    title={isPay ? "عرض إيصال التحصيل ومشاركته عبر واتساب" : "عرض إيصال السلفة ومشاركته عبر واتساب"}
                  >
                    <td className="p-3 text-xs font-mono">{formatDate(item.date)}</td>
                    <td className="p-3 font-bold text-slate-800 whitespace-nowrap">
                      {item.customer?.name || "—"}
                      {item.customer?.phone && (
                        <span className="block text-[11px] font-normal text-slate-500 font-mono">
                          {item.customer.phone}
                        </span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {isPay ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          <span>💰</span>
                          <span>تحصيل ({item.methodOrType})</span>
                        </span>
                      ) : isDebit ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          <span>💸</span>
                          <span>سلفة عميل</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                          <span>🟢</span>
                          <span>تسوية رصيد</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-600 whitespace-nowrap">{item.treasury?.name || "—"}</td>
                    <td className="p-3 font-mono font-black whitespace-nowrap">
                      {isPay ? (
                        <span className="text-emerald-700">+{formatEGP(item.amount)} ج</span>
                      ) : isDebit ? (
                        <span className="text-amber-700">+{formatEGP(item.amount)} ج</span>
                      ) : (
                        <span className="text-blue-700">-{formatEGP(item.amount)} ج</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-600 max-w-xs truncate">{item.notes || "—"}</td>
                    <td className="p-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {isPay ? (
                          <>
                            <button
                              onClick={() => setSelectedPaymentReceiptId(item.id)}
                              className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded-lg font-bold transition-colors cursor-pointer shadow-sm"
                              title="إيصال التحصيل"
                            >
                              💳 إيصال
                            </button>
                            <button
                              onClick={(e) => handleDeletePayment(item.raw, e)}
                              className="text-xs p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف سند التحصيل"
                            >
                              🗑️
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setSelectedAdjustmentReceiptId(item.id)}
                              className="text-xs px-2.5 py-1 bg-amber-100 text-amber-900 hover:bg-amber-200 rounded-lg font-bold transition-colors cursor-pointer shadow-sm"
                              title="إيصال السلفة"
                            >
                              🧾 إيصال
                            </button>
                            <button
                              onClick={(e) => handleDeleteAdjustment(item.raw, e)}
                              className="text-xs p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف السلفة"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400 font-bold">
                    لا توجد حركات تحصيل أو سلف مطابقة للبحث أو الفلتر
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showPaymentModal && (
        <CollectionForm
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => {
            setShowPaymentModal(false);
            refetchPayments();
          }}
        />
      )}

      {showAdvanceModal && (
        <CustomerAdjustmentModal
          isOpen={showAdvanceModal}
          onClose={() => setShowAdvanceModal(false)}
          onSuccess={() => {
            setShowAdvanceModal(false);
            refetchAdjustments();
          }}
        />
      )}

      {selectedPaymentReceiptId && (
        <PaymentReceiptModal
          paymentId={selectedPaymentReceiptId}
          onClose={() => setSelectedPaymentReceiptId(null)}
        />
      )}

      {selectedAdjustmentReceiptId && (
        <CustomerAdjustmentReceiptModal
          adjustmentId={selectedAdjustmentReceiptId}
          onClose={() => setSelectedAdjustmentReceiptId(null)}
        />
      )}
    </div>
  );
}

function CollectionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ customer_id: '', amount: 0, payment_method: 'نقدي', treasury_id: '', payment_date: '', notes: '' });
  const { mutate, loading } = useApiMutation();
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [treasuries, setTreasuries] = useState<{ id: string; name: string }[]>([]);
  const [custSearch, setCustSearch] = useState("");

  useEffect(() => {
    fetch('/api/treasury').then(r => r.json()).then(j => setTreasuries(j.data?.items || [])).catch(() => {});
    fetch('/api/customers?limit=200').then(r => r.json()).then(j => setCustomers(j.data?.items || [])).catch(() => {});
  }, []);

  const filtered = customers.filter(c => c.name.includes(custSearch)).slice(0, 50);

  async function save() {
    if (!f.customer_id || !f.treasury_id || f.amount <= 0) { alert('❌ أكمل البيانات'); return; }
    const { error } = await mutate('POST', '/api/payments/customers', f);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3">
        <h2 className="text-xl font-bold">+ تحصيل من عميل</h2>
        <div>
          <label className="text-sm font-medium block mb-1">العميل *</label>
          <input className="input-field" placeholder="🔍 ابحث عن عميل..." value={custSearch} onChange={(e) => setCustSearch(e.target.value)} autoFocus />
          <select className="input-field mt-1" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })} size={4}>
            {filtered.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium block mb-1">المبلغ *</label><input type="number" step="0.01" className="input-field" value={f.amount} onChange={(e) => setF({ ...f, amount: parseFloat(e.target.value) || 0 })} /></div>
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
        <div className="flex gap-2 pt-3"><button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button><button onClick={onClose} className="btn-secondary">إلغاء</button></div>
      </div>
    </div>
  );
}
