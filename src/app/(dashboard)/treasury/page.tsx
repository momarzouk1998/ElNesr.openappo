"use client";
import { useState } from "react";
import Link from "next/link";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP } from "@/lib/format";

interface Treasury {
  id: string; name: string; type: string; current_balance: number; opening_balance: number;
  notes: string | null; is_active: boolean;
  assigned_user?: { full_name: string } | null;
}

export default function TreasuryPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Treasury | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const { data, loading, refetch } = useApi<{ items: Treasury[]; total: number }>('/api/treasury');
  const { mutate, loading: saving } = useApiMutation();

  const treasuries = (data?.items || []).filter(t => t.name.includes(search));
  const totalBalance = treasuries.reduce((s, t) => s + Number(t.current_balance), 0);
  const totalOpening = treasuries.reduce((s, t) => s + Number(t.opening_balance), 0);

  async function deleteTreasury(t: Treasury) {
    if (!confirm(`هل تريد حذف خزينة "${t.name}"؟`)) return;
    const { error } = await mutate('DELETE', `/api/treasury/${t.id}`);
    if (error) { alert('❌ ' + error); return; }
    alert('✅ تم الحذف');
    refetch();
  }

  async function recalculateAll() {
    if (!confirm('⚠️ هل تريد إعادة حساب وتصفير أرصدة جميع الخزائن تلقائياً مطابقةً مع المعاملات الفعلية المسجلة بالسيستم؟')) return;
    try {
      setRecalculating(true);
      const res = await fetch('/api/treasury/recalculate', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        alert('❌ ' + (json?.error?.message || 'حدث خطأ أثناء إعادة الحساب'));
        return;
      }
      alert('✅ تم إعادة حساب وتصفير أرصدة الخزائن بنجاح');
      refetch();
    } catch {
      alert('❌ حدث خطأ في النظام');
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🏦 الخزائن</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <Link
            href="/treasury/customer-payments"
            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs sm:text-sm flex items-center gap-1 transition-all shadow-sm cursor-pointer"
          >
            <span>💰</span>
            <span>تحصيلات وسلف العملاء</span>
          </Link>
          <Link
            href="/treasury/supplier-payments"
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs sm:text-sm flex items-center gap-1 transition-all shadow-sm cursor-pointer"
          >
            <span>🏭</span>
            <span>مدفوعات الموردين</span>
          </Link>
          <button
            onClick={recalculateAll}
            disabled={recalculating}
            className="btn-secondary text-xs sm:text-sm font-bold flex items-center gap-1 cursor-pointer"
            title="إعادة تصفير وحساب الأرصدة من المعاملات المسجلة"
          >
            <span>🔄</span>
            <span>{recalculating ? 'جاري إعادة الحساب...' : 'تصفير/إعادة حساب الأرصدة'}</span>
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs sm:text-sm">+ خزينة جديدة</button>
        </div>
      </div>

      <div className="card">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث باسم الخزينة..." className="input-field" autoFocus />
      </div>

      {/* كاردات إجماليات */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-500">عدد الخزائن</div>
          <div className="text-2xl font-extrabold text-slate-650">{treasuries.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">إجمالي الأرصدة الحالية</div>
          <div className="text-2xl font-extrabold text-elnesr-600 font-mono">{formatEGP(totalBalance)} ج</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">إجمالي الأرصدة الافتتاحية</div>
          <div className="text-2xl font-extrabold text-slate-650 font-mono">{formatEGP(totalOpening)} ج</div>
        </div>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {treasuries.map(t => (
            <div key={t.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-gray-500">{t.type}</div>
                  <div className="font-bold text-lg">{t.name}</div>
                  {t.assigned_user && <div className="text-xs text-gray-600 mt-1">👤 {t.assigned_user.full_name}</div>}
                  {t.notes && <div className="text-xs text-gray-500 mt-1">📝 {t.notes}</div>}
                </div>
                <div className="text-3xl">🏦</div>
              </div>
              <div className="mt-3 pt-3 border-t">
                <div className="text-xs text-gray-500">الرصيد الحالي</div>
                <div className="text-2xl font-extrabold text-elnesr-600 font-mono">{formatEGP(t.current_balance)} ج</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setEditing(t)} className="flex-1 text-xs py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold cursor-pointer">✏️ تعديل الرصيد</button>
                <button onClick={() => deleteTreasury(t)} className="flex-1 text-xs py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 font-bold cursor-pointer">🗑️ حذف</button>
              </div>
            </div>
          ))}
          {treasuries.length === 0 && <div className="card text-center text-gray-400 py-12 col-span-full">لا توجد خزائن</div>}
        </div>
      )}

      {(showAdd || editing) && (
        <TreasuryForm
          treasury={editing}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

const TYPES = ["رئيسية", "عهدة عربية", "إدارة"];

function TreasuryForm({ treasury, onClose, onSaved }: { treasury: Treasury | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: treasury?.name || "",
    type: treasury?.type || "رئيسية",
    opening_balance: treasury ? Number(treasury.opening_balance) : 0,
    current_balance: treasury ? Number(treasury.current_balance) : 0,
    notes: treasury?.notes || "",
    is_active: treasury?.is_active !== false,
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم الخزينة مطلوب'); return; }
    const url = treasury ? `/api/treasury/${treasury.id}` : '/api/treasury';
    const method = treasury ? 'PATCH' : 'POST';
    const { error } = await mutate(method, url, f);
    if (error) { alert('❌ ' + error); return; }
    alert(treasury ? '✅ تم تعديل الخزينة' : '✅ تم إضافة الخزينة');
    onSaved();
  }

  async function recalculateThis() {
    if (!treasury) return;
    const { error } = await mutate('PATCH', `/api/treasury/${treasury.id}`, { recalculate: true });
    if (error) { alert('❌ ' + error); return; }
    alert('✅ تم إعادة حساب رصيد هذه الخزينة بنجاح');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-bold">{treasury ? '✏️ تعديل وتصفير الخزينة' : '🏦 + خزينة جديدة'}</h2>
        
        <div>
          <label className="text-sm font-medium block mb-1">اسم الخزينة *</label>
          <input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">النوع</label>
          <select className="input-field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">الرصيد الافتتاحي</label>
            <input type="number" step="0.01" className="input-field font-mono" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1 text-emerald-800 font-bold">الرصيد الحالي *</label>
            <input type="number" step="0.01" className="input-field font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-300" value={f.current_balance} onChange={(e) => setF({ ...f, current_balance: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>

        {treasury && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setF({ ...f, current_balance: 0 })}
              className="text-xs px-2.5 py-1.5 bg-amber-100 text-amber-900 rounded-lg hover:bg-amber-200 font-bold cursor-pointer flex-1"
            >
              ⚡ تصفير الحالي (0 ج)
            </button>
            <button
              type="button"
              onClick={recalculateThis}
              className="text-xs px-2.5 py-1.5 bg-blue-100 text-blue-900 rounded-lg hover:bg-blue-200 font-bold cursor-pointer flex-1"
            >
              🔄 إعادة حساب من الحركات
            </button>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">ملاحظات</label>
          <input className="input-field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>

        <div className="flex items-center gap-2">
          <input id="active" type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
          <label htmlFor="active" className="text-sm">نشطة</label>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
