"use client";
import { useState } from "react";
import Link from "next/link";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP } from "@/lib/format";
import * as Lucide from "lucide-react";

interface Treasury {
  id: string;
  name: string;
  type: string;
  current_balance: number;
  opening_balance: number;
  notes: string | null;
  is_active: boolean;
  assigned_user?: { full_name: string } | null;
}

export default function TreasuryPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Treasury | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Direct Transaction Modal State
  const [directTx, setDirectTx] = useState<{ type: "deposit" | "withdrawal"; treasury?: Treasury } | null>(null);

  const { data, loading, refetch } = useApi<{ items: Treasury[]; total: number }>("/api/treasury");
  const { mutate } = useApiMutation();

  const treasuries = (data?.items || []).filter((t) => t.name.includes(search));
  const totalBalance = treasuries.reduce((s, t) => s + Number(t.current_balance), 0);
  const totalOpening = treasuries.reduce((s, t) => s + Number(t.opening_balance), 0);

  async function deleteTreasury(t: Treasury) {
    if (!confirm(`هل تريد حذف خزينة "${t.name}"؟`)) return;
    const { error } = await mutate("DELETE", `/api/treasury/${t.id}`);
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert("✅ تم الحذف");
    refetch();
  }

  async function recalculateAll() {
    if (
      !confirm(
        "⚠️ هل تريد إعادة حساب وتصفير أرصدة جميع الخزائن تلقائياً مطابقةً مع المعاملات الفعلية المسجلة بالسيستم؟"
      )
    )
      return;
    try {
      setRecalculating(true);
      const res = await fetch("/api/treasury/recalculate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "حدث خطأ أثناء إعادة الحساب"));
        return;
      }
      alert("✅ تم إعادة حساب وتصفير أرصدة الخزائن بنجاح");
      refetch();
    } catch {
      alert("❌ حدث خطأ في النظام");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-2">
            <span>🏦</span>
            <span>الخزائن والمعاملات النقدية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة الخزائن، كشوفات الحساب، تسجيل الإيداع والسحب النقدي المباشر وربط التحصيلات
          </p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={recalculateAll}
            disabled={recalculating}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 disabled:opacity-50"
            title="إعادة تصفير وحساب الأرصدة من المعاملات المسجلة"
          >
            <Lucide.RotateCcw className={`w-4 h-4 ${recalculating ? "animate-spin text-amber-600" : ""}`} />
            <span>{recalculating ? "جاري إعادة الحساب..." : "تصفير/إعادة حساب الأرصدة"}</span>
          </button>

          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            <Lucide.Plus className="w-4 h-4" />
            <span>خزينة جديدة</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
        <Lucide.Search className="w-5 h-5 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم الخزينة أو العهدة..."
          className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-800 placeholder:text-slate-400"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2">
            مسح
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500">إجمالي الأرصدة الحالية بالخزائن</div>
            <div className="text-2xl md:text-3xl font-black text-emerald-600 font-mono mt-1">
              {formatEGP(totalBalance)} <span className="text-xs font-bold text-slate-500">ج.م</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shadow-inner">
            💰
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500">إجمالي الأرصدة الافتتاحية</div>
            <div className="text-2xl md:text-3xl font-black text-slate-700 font-mono mt-1">
              {formatEGP(totalOpening)} <span className="text-xs font-bold text-slate-500">ج.م</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl shadow-inner">
            🏛️
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500">عدد الخزائن النشطة</div>
            <div className="text-2xl md:text-3xl font-black text-blue-600 font-mono mt-1">{treasuries.length}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shadow-inner">
            🏦
          </div>
        </div>
      </div>

      {/* Treasuries Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 font-bold">
          ⏳ جاري تحميل بيانات الخزائن...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {treasuries.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold mb-1">
                      {t.type}
                    </span>
                    <h3 className="font-extrabold text-lg text-slate-900">{t.name}</h3>
                    {t.assigned_user && (
                      <div className="text-xs text-blue-700 font-semibold mt-1 flex items-center gap-1">
                        <span>👤 المسئول:</span>
                        <span>{t.assigned_user.full_name}</span>
                      </div>
                    )}
                    {t.notes && <div className="text-xs text-slate-500 mt-1 line-clamp-2">📝 {t.notes}</div>}
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center text-2xl shrink-0">
                    🏦
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">الرصيد الحالي:</span>
                  <span className="text-xl font-black text-emerald-600 font-mono">
                    {formatEGP(t.current_balance)} <span className="text-xs font-bold text-slate-500">ج</span>
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {/* Statement Link Button */}
                <Link
                  href={`/treasury/${t.id}`}
                  className="w-full py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors border border-blue-200 shadow-sm"
                >
                  <Lucide.FileText className="w-4 h-4" />
                  <span>عرض كشف حساب الخزينة التفصيلي</span>
                </Link>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDirectTx({ type: "deposit", treasury: t })}
                    className="py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center gap-1 border border-emerald-200 transition-colors cursor-pointer"
                  >
                    <Lucide.PlusCircle className="w-3.5 h-3.5" />
                    <span>إيداع نقدية</span>
                  </button>

                  <button
                    onClick={() => setDirectTx({ type: "withdrawal", treasury: t })}
                    className="py-1.5 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-1 border border-rose-200 transition-colors cursor-pointer"
                  >
                    <Lucide.MinusCircle className="w-3.5 h-3.5" />
                    <span>سحب نقدية</span>
                  </button>
                </div>

                {/* Edit & Delete */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Lucide.Pencil className="w-3.5 h-3.5" />
                    <span>تعديل الرصيد/البيانات</span>
                  </button>
                  <button
                    onClick={() => deleteTreasury(t)}
                    className="text-xs p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors font-bold cursor-pointer"
                    title="حذف الخزينة"
                  >
                    <Lucide.Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {treasuries.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400 font-semibold col-span-full">
              لا توجد خزائن مسجلة تطابق البحث
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Treasury Modal */}
      {(showAdd || editing) && (
        <TreasuryForm
          treasury={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowAdd(false);
            setEditing(null);
            refetch();
          }}
        />
      )}

      {/* Direct Deposit / Withdrawal Modal */}
      {directTx && (
        <DirectTransactionModal
          type={directTx.type}
          initialTreasuryId={directTx.treasury?.id}
          treasuries={treasuries}
          onClose={() => setDirectTx(null)}
          onSuccess={() => {
            setDirectTx(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

const TYPES = ["رئيسية", "عهدة عربية", "إدارة", "بنك/محفظة"];

function TreasuryForm({
  treasury,
  onClose,
  onSaved,
}: {
  treasury: Treasury | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: treasury?.name || "",
    type: treasury?.type || "رئيسية",
    opening_balance: treasury ? Number(treasury.opening_balance) : 0,
    current_balance: treasury ? Number(treasury.current_balance) : 0,
    notes: treasury?.notes || "",
  });
  const { mutate, loading } = useApiMutation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return alert("اسم الخزينة مطلوب");
    const url = treasury ? `/api/treasury/${treasury.id}` : "/api/treasury";
    const method = treasury ? "PATCH" : "POST";
    const { error } = await mutate(method, url, f);
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert(treasury ? "✅ تم التعديل بنجاح" : "✅ تم إنشاء الخزينة بنجاح");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span>🏦</span>
            <span>{treasury ? "تعديل بيانات الخزينة" : "إضافة خزينة جديدة"}</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <Lucide.X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 text-xs font-bold text-slate-700">
          <div>
            <label className="block mb-1">اسم الخزينة *</label>
            <input
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="مثال: الخزينة الرئيسية، عهدة سيارة 1..."
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div>
            <label className="block mb-1">نوع الخزينة</label>
            <select
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value })}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-600 outline-none"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">الرصيد الافتتاحي</label>
              <input
                type="number"
                step="any"
                value={f.opening_balance}
                onChange={(e) => setF({ ...f, opening_balance: Number(e.target.value) })}
                className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-bold font-mono focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
            <div>
              <label className="block mb-1">الرصيد الحالي</label>
              <input
                type="number"
                step="any"
                value={f.current_balance}
                onChange={(e) => setF({ ...f, current_balance: Number(e.target.value) })}
                className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-bold font-mono focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1">ملاحظات</label>
            <textarea
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
              placeholder="أي ملاحظات إضافية..."
              className="w-full p-3 border border-slate-200 rounded-xl text-sm font-normal focus:ring-2 focus:ring-blue-600 outline-none"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? "جاري الحفظ..." : treasury ? "حفظ التعديلات" : "إنشاء الخزينة"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   Direct Transaction Modal Component (إيداع / سحب نقدية مباشر)
========================================================================= */
function DirectTransactionModal({
  type,
  initialTreasuryId,
  treasuries,
  onClose,
  onSuccess,
}: {
  type: "deposit" | "withdrawal";
  initialTreasuryId?: string;
  treasuries: Treasury[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [treasuryId, setTreasuryId] = useState(initialTreasuryId || (treasuries[0]?.id || ""));
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(
    type === "deposit" ? "توريد نقدية مباشر / تغذية خزينة" : "سحب نقدي مباشر / عهدة"
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const isDeposit = type === "deposit";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!treasuryId) return alert("يرجى اختيار الخزينة");
    if (!amount || Number(amount) <= 0) return alert("يرجى إدخال مبلغ صحيح أكبر من الصفر");

    setLoading(true);
    try {
      const res = await fetch("/api/treasury/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasury_id: treasuryId,
          type,
          amount: Number(amount),
          transaction_date: transactionDate,
          title: title.trim(),
          notes: notes.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert("❌ " + (json?.error?.message || "فشل تسجيل الحركة"));
        return;
      }

      alert("✅ " + json.message);
      onSuccess();
    } catch {
      alert("❌ حدث خطأ غير متوقع أثناء تسجيل الحركة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                isDeposit ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              }`}
            >
              {isDeposit ? <Lucide.PlusCircle className="w-6 h-6" /> : <Lucide.MinusCircle className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">
                {isDeposit ? "إيداع نقدي مباشر (+)" : "سحب نقدي مباشر (-)"}
              </h2>
              <p className="text-[11px] text-slate-500 font-semibold">
                {isDeposit ? "إضافة وتغذية نقدية مباشرة للخزينة" : "صرف وسحب نقدية مباشر من الخزينة"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <Lucide.X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-bold text-slate-700">
          <div>
            <label className="block mb-1">الخزينة المستهدفة *</label>
            <select
              required
              value={treasuryId}
              onChange={(e) => setTreasuryId(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
            >
              {treasuries.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (رصيدها الحالي: {formatEGP(t.current_balance)} ج)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">المبلغ (ج.م) *</label>
              <input
                required
                type="number"
                step="any"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full h-11 px-3 border border-slate-200 rounded-xl text-base font-black font-mono focus:ring-2 outline-none ${
                  isDeposit ? "text-emerald-600 focus:ring-emerald-600" : "text-rose-600 focus:ring-rose-600"
                }`}
              />
            </div>
            <div>
              <label className="block mb-1">التاريخ *</label>
              <input
                required
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full h-11 px-3 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1">البيان الأساسي للحركة *</label>
            <input
              required
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isDeposit ? "مثال: توريد نقدية من الإدارة..." : "مثال: عهدة مؤقتة، إيداع بنكي..."}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div>
            <label className="block mb-1">ملاحظات وتفاصيل إضافية (اختياري)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب أي تفاصيل أخرى..."
              rows={2}
              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-normal focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 text-[11px] leading-relaxed font-semibold">
            💡 <strong>ملاحظة:</strong> سيتم تعديل رصيد الخزينة فوراً وإدراج الحركة بالتفصيل في كشف حساب الخزينة.
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 h-11 rounded-xl text-white font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                isDeposit ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
              }`}
            >
              {loading ? "جاري التسجيل..." : isDeposit ? "تأكيد الإيداع (+)" : "تأكيد الصرف (-)"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
