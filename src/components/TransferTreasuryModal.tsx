"use client";

import React, { useState } from "react";
import { formatEGP } from "@/lib/format";
import * as Lucide from "lucide-react";

interface Treasury {
  id: string;
  name: string;
  type: string;
  current_balance: number;
}

interface TransferTreasuryModalProps {
  treasuries: Treasury[];
  initialFromId?: string;
  initialToId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransferTreasuryModal({
  treasuries,
  initialFromId,
  initialToId,
  onClose,
  onSuccess,
}: TransferTreasuryModalProps) {
  const [fromId, setFromId] = useState<string>(() => {
    if (initialFromId) return initialFromId;
    return treasuries[0]?.id || "";
  });

  const [toId, setToId] = useState<string>(() => {
    if (initialToId && initialToId !== initialFromId) return initialToId;
    const other = treasuries.find((t) => t.id !== (initialFromId || treasuries[0]?.id));
    return other ? other.id : "";
  });

  const [amount, setAmount] = useState<string>("");
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const fromTreasury = treasuries.find((t) => t.id === fromId);
  const toTreasury = treasuries.find((t) => t.id === toId);

  const numAmount = parseFloat(amount) || 0;

  function handleSwap() {
    const temp = fromId;
    setFromId(toId);
    setToId(temp);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromId || !toId) {
      alert("⚠️ يرجى اختيار الخزينة المصدر والخزينة الوجهة");
      return;
    }
    if (fromId === toId) {
      alert("❌ لا يمكن التحويل لنفس الخزينة");
      return;
    }
    if (!numAmount || numAmount <= 0) {
      alert("❌ يرجى إدخال مبلغ صحيح أكبر من الصفر");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/treasury/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_treasury_id: fromId,
          to_treasury_id: toId,
          amount: numAmount,
          transfer_date: transferDate,
          notes: notes.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert("❌ " + (json?.error?.message || "فشل تنفيذ التحويل"));
        return;
      }

      alert("✅ " + (json.message || "تم تحويل النقدية بنجاح"));
      onSuccess();
    } catch {
      alert("❌ حدث خطأ غير متوقع أثناء إجراء التحويل");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-4">
      <div className="bg-white rounded-3xl p-5 md:p-6 max-w-lg w-full shadow-2xl border border-slate-100 animate-fade-in space-y-4 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-inner">
              <Lucide.ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-1.5">
                <span>تحويل نقدية بين الخزائن</span>
              </h2>
              <p className="text-xs text-slate-500 font-semibold">
                نقل سيولة نقدية مباشرة مع تحديث الأرصدة وإدراجها في كشف الحساب
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Lucide.X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-bold text-slate-700">
          {/* From and To Section with Swap Button */}
          <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            {/* From Treasury */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-rose-700 font-bold flex items-center gap-1">
                  <Lucide.ArrowUpRight className="w-4 h-4 text-rose-500" />
                  <span>من خزينة (المصدر - خروج نقدية) *</span>
                </label>
                {fromTreasury && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    الرصيد: <strong className="text-slate-800">{formatEGP(fromTreasury.current_balance)} ج</strong>
                  </span>
                )}
              </div>
              <select
                required
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-purple-600 outline-none"
              >
                <option value="">— اختر الخزينة المصدر —</option>
                {treasuries.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.id === toId}>
                    {t.name} ({formatEGP(t.current_balance)} ج)
                  </option>
                ))}
              </select>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center py-0.5">
              <button
                type="button"
                onClick={handleSwap}
                className="px-3 py-1 bg-white border border-slate-300 hover:border-purple-500 hover:bg-purple-50 text-purple-700 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                title="تبديل الخزائن"
              >
                <Lucide.ArrowUpDown className="w-3.5 h-3.5" />
                <span>تبديل الاتجاه</span>
              </button>
            </div>

            {/* To Treasury */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-emerald-700 font-bold flex items-center gap-1">
                  <Lucide.ArrowDownLeft className="w-4 h-4 text-emerald-500" />
                  <span>إلى خزينة (الوجهة - استلام نقدية) *</span>
                </label>
                {toTreasury && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    الرصيد: <strong className="text-slate-800">{formatEGP(toTreasury.current_balance)} ج</strong>
                  </span>
                )}
              </div>
              <select
                required
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-purple-600 outline-none"
              >
                <option value="">— اختر الخزينة الوجهة —</option>
                {treasuries.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.id === fromId}>
                    {t.name} ({formatEGP(t.current_balance)} ج)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-slate-800 font-extrabold">المبلغ المحول (ج.م) *</label>
              <input
                required
                type="number"
                step="any"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-11 px-3 border border-slate-200 rounded-xl text-lg font-black font-mono text-purple-700 focus:ring-2 focus:ring-purple-600 outline-none"
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-800 font-extrabold">تاريخ التحويل *</label>
              <input
                required
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full h-11 px-3 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-purple-600 outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block mb-1 text-slate-700 font-bold">البيان / ملاحظات التحويل (اختياري)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: توريد مبيعات اليوم، تسليم عهدة أسبوعية..."
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-600 outline-none"
            />
          </div>

          {/* Live Balance Impact Preview */}
          {fromTreasury && toTreasury && numAmount > 0 && (
            <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2">
              <div className="text-[11px] font-extrabold text-purple-900 flex items-center gap-1">
                <span>🔍</span>
                <span>معاينة الأرصدة بعد التحويل:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white rounded-xl border border-rose-100">
                  <div className="text-[10px] text-slate-500 font-semibold truncate">{fromTreasury.name} (المصدر)</div>
                  <div className="font-mono font-bold text-rose-700 mt-0.5">
                    {formatEGP(Number(fromTreasury.current_balance) - numAmount)} ج
                  </div>
                  <div className="text-[9px] text-rose-500 font-mono mt-0.5">
                    (- {formatEGP(numAmount)} ج)
                  </div>
                </div>

                <div className="p-2 bg-white rounded-xl border border-emerald-100">
                  <div className="text-[10px] text-slate-500 font-semibold truncate">{toTreasury.name} (الوجهة)</div>
                  <div className="font-mono font-bold text-emerald-700 mt-0.5">
                    {formatEGP(Number(toTreasury.current_balance) + numAmount)} ج
                  </div>
                  <div className="text-[9px] text-emerald-500 font-mono mt-0.5">
                    (+ {formatEGP(numAmount)} ج)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submit and Cancel Buttons */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={loading || !fromId || !toId || fromId === toId || numAmount <= 0}
              className="flex-1 h-11 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-sm transition-all shadow-md shadow-purple-700/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>جاري التحويل...</span>
                </>
              ) : (
                <>
                  <Lucide.Check className="w-4 h-4" />
                  <span>تأكيد تحويل النقدية</span>
                </>
              )}
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
