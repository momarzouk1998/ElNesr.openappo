"use client";
import { useState, useEffect } from "react";
import { formatEGP } from "@/lib/format";
import CustomerAdjustmentReceiptModal from "@/components/CustomerAdjustmentReceiptModal";

interface CustomerAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (adjustmentId?: string) => void;
  defaultCustomerId?: string;
  defaultCustomerName?: string;
  defaultType?: "debit" | "credit";
}

export default function CustomerAdjustmentModal({
  isOpen,
  onClose,
  onSuccess,
  defaultCustomerId,
  defaultCustomerName,
  defaultType = "debit",
}: CustomerAdjustmentModalProps) {
  const [customerId, setCustomerId] = useState(defaultCustomerId || "");
  const [customerName, setCustomerName] = useState(defaultCustomerName || "");
  const [type, setType] = useState<"debit" | "credit">(defaultType); // debit = سلفة / إضافة عليه, credit = خصم منه / تسوية
  const [amount, setAmount] = useState<string>("");
  const [adjustmentDate, setAdjustmentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [treasuries, setTreasuries] = useState<{ id: string; name: string; current_balance: number }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string | null; balance: number }[]>([]);
  const [custSearch, setCustSearch] = useState("");
  const [createdReceiptId, setCreatedReceiptId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultCustomerId) {
      setCustomerId(defaultCustomerId);
    }
  }, [defaultCustomerId]);

  useEffect(() => {
    if (defaultCustomerName) {
      setCustomerName(defaultCustomerName);
    }
  }, [defaultCustomerName]);

  useEffect(() => {
    if (defaultType) {
      setType(defaultType);
    }
  }, [defaultType]);

  useEffect(() => {
    fetch("/api/treasury")
      .then((r) => r.json())
      .then((j) => {
        const items = Array.isArray(j.data?.items) ? j.data.items : Array.isArray(j.data) ? j.data : [];
        setTreasuries(items);
        if (items.length > 0 && !treasuryId) {
          setTreasuryId(items[0].id);
        }
      })
      .catch(() => {});

    if (!defaultCustomerId) {
      fetch("/api/customers?limit=1000")
        .then((r) => r.json())
        .then((j) => {
          const items = Array.isArray(j.data?.items) ? j.data.items : Array.isArray(j.data) ? j.data : [];
          setCustomers(items);
        })
        .catch(() => {});
    }
  }, [defaultCustomerId]);

  if (!isOpen) return null;

  // If receipt is ready, show receipt modal
  if (createdReceiptId) {
    return (
      <CustomerAdjustmentReceiptModal
        adjustmentId={createdReceiptId}
        onClose={() => {
          setCreatedReceiptId(null);
          onClose();
        }}
      />
    );
  }

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(custSearch))
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      alert("❌ يرجى اختيار العميل");
      return;
    }
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

      const newId = json.data?.id;
      if (onSuccess) onSuccess(newId);

      if (newId) {
        setCreatedReceiptId(newId);
      } else {
        alert("✅ تم تسجيل الحركة وتحديث رصيد العميل بنجاح");
        onClose();
      }
    } catch {
      alert("❌ حدث خطأ أثناء الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 sm:p-6 space-y-4 my-auto animate-scale-up border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
            <span>{type === "debit" ? "💸" : "📝"}</span>
            <span>
              {type === "debit" ? "تسجيل سلفة لعميل" : "تسوية حساب عميل"}
              {customerName ? ` (${customerName})` : ""}
            </span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-right">
          {/* Customer Selection if not pre-set */}
          {!defaultCustomerId && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">العميل *</label>
              <input
                type="text"
                placeholder="🔍 ابحث عن العميل..."
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                className="w-full p-2 mb-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white"
              />
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const found = customers.find((c) => c.id === e.target.value);
                  if (found) setCustomerName(found.name);
                }}
                required
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-xs sm:text-sm font-bold text-slate-800"
              >
                <option value="">اختر العميل...</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""} — (رصيده: {formatEGP(c.balance)} ج)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* نوع الحركة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع الحركة *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("debit")}
                className={`p-2.5 rounded-xl border text-xs font-black flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  type === "debit"
                    ? "bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>🔴 سلفة / إضافة على الحساب</span>
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
                <span>🟢 خصم / تسوية رصيد</span>
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
                <option key={t.id} value={t.id}>
                  {t.name} (رصيدها: {formatEGP(t.current_balance)} ج)
                </option>
              ))}
            </select>
          </div>

          {/* البيان */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البيان / سبب السلفة *</label>
            <input
              type="text"
              placeholder="مثال: سلفة نقدية شخصية، مصاريف نقل، فرق حساب..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? "جاري الحفظ..." : "تأكيد وتسجيل الحركة وفتح الإيصال 🧾"}
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
