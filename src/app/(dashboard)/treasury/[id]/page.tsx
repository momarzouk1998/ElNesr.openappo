"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatEGP, formatDate } from "@/lib/format";
import * as Lucide from "lucide-react";

interface StatementItem {
  id: string;
  date: string;
  type: "in" | "out";
  category: string;
  label: string;
  party: string;
  amountIn: number;
  amountOut: number;
  balance: number;
  notes: string;
  user: string;
}

interface StatementData {
  treasury: {
    id: string;
    name: string;
    type: string;
    opening_balance: number;
    current_balance: number;
    calculated_balance: number;
    assigned_user: string | null;
    notes: string | null;
  };
  summary: {
    opening_balance: number;
    total_in: number;
    total_out: number;
    current_balance: number;
    calculated_balance: number;
    period_in: number;
    period_out: number;
    period_net: number;
    movement_count: number;
    total_count: number;
  };
  items: StatementItem[];
}

export default function TreasuryStatementPage() {
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Filters
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Direct Transaction Modal
  const [showTxModal, setShowTxModal] = useState<"deposit" | "withdrawal" | null>(null);
  const [txAmount, setTxAmount] = useState<string>("");
  const [txTitle, setTxTitle] = useState<string>("");
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [txNotes, setTxNotes] = useState<string>("");
  const [txSubmitting, setTxSubmitting] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  const loadStatement = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (fromDate) q.set("from_date", fromDate);
      if (toDate) q.set("to_date", toDate);
      if (typeFilter !== "all") q.set("type", typeFilter);
      if (search.trim()) q.set("search", search.trim());

      const res = await fetch(`/api/treasury/${id}/statement?${q.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error?.message || "فشل تحميل كشف الحساب");
        return;
      }
      setData(json.data);
    } catch {
      setError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [id, fromDate, toDate, typeFilter, search]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  // Submit direct deposit or withdrawal
  async function handleDirectTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!showTxModal || !txAmount || Number(txAmount) <= 0) {
      alert("يرجى إدخال مبلغ صحيح");
      return;
    }

    setTxSubmitting(true);
    try {
      const res = await fetch("/api/treasury/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasury_id: id,
          type: showTxModal,
          amount: Number(txAmount),
          transaction_date: txDate,
          title: txTitle,
          notes: txNotes,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert("❌ " + (json?.error?.message || "فشل تسجيل الحركة"));
        return;
      }

      alert("✅ " + json.message);
      setShowTxModal(null);
      setTxAmount("");
      setTxTitle("");
      setTxNotes("");
      loadStatement();
    } catch {
      alert("❌ حدث خطأ غير متوقع");
    } finally {
      setTxSubmitting(false);
    }
  }

  // Copy WhatsApp Formatted Statement
  function copyWhatsAppReport() {
    if (!data) return;

    const tr = data.treasury;
    const s = data.summary;
    const periodText =
      fromDate || toDate
        ? `من ${fromDate || "البداية"} إلى ${toDate || "اليوم"}`
        : "كامل الحركات التاريخية";

    const recentItems = (data.items || []).slice(0, 15);
    const itemsLines = recentItems
      .map((item) => {
        const isPlus = item.amountIn > 0;
        const sign = isPlus ? "🟢 +" : "🔴 -";
        const amt = isPlus ? item.amountIn : item.amountOut;
        return `• ${formatDate(item.date)} | ${sign}${formatEGP(amt)} ج\n   └ ${item.label}${item.notes && item.notes !== "—" ? ` (${item.notes})` : ""}`;
      })
      .join("\n");

    const text = `🦅 *شركة النسر للأدوات واللوحات الكهربائية*
━━━━━━━━━━━━━━━━━━━━
🏦 *كشف حساب خزينة:* [ ${tr.name} ]
🏷️ *النوع:* ${tr.type}${tr.assigned_user ? ` | 👤 المسئول: ${tr.assigned_user}` : ""}
📅 *الفترة:* ${periodText}
━━━━━━━━━━━━━━━━━━━━
💵 *الرصيد الافتتاحي:* ${formatEGP(s.opening_balance)} ج.م
🟢 *إجمالي الوارد (+):* ${formatEGP(s.period_in)} ج.م
🔴 *إجمالي المنصرف (-):* ${formatEGP(s.period_out)} ج.م
━━━━━━━━━━━━━━━━━━━━
💰 *الرصيد الحالي:* ${formatEGP(tr.current_balance)} ج.م
━━━━━━━━━━━━━━━━━━━━
📋 *سجل الحركات (${recentItems.length} من أصل ${data.items.length}):*
${itemsLines || "• لا توجد حركات مسجلة بالفترة"}
━━━━━━━━━━━━━━━━━━━━
⏰ *تاريخ التقرير:* ${new Date().toLocaleDateString("ar-EG")} ${new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 3000);
    });
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <Link
            href="/treasury"
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="الرجوع للخزائن"
          >
            <Lucide.ArrowRight className="w-5 h-5" />
          </Link>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center text-2xl shadow-sm">
            🏦
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black text-slate-800">
                {data?.treasury?.name || "كشف حساب الخزينة"}
              </h1>
              {data?.treasury?.type && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                  {data.treasury.type}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>كشف حساب محاسبي تفصيلي وتتبع كامل لحركات الوارد والمنصرف والرصيد اللحظي</span>
              {data?.treasury?.assigned_user && (
                <span className="text-blue-600 font-semibold">• 👤 المسئول: {data.treasury.assigned_user}</span>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setTxTitle("");
              setTxNotes("");
              setTxAmount("");
              setShowTxModal("deposit");
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-emerald-600/20"
          >
            <Lucide.PlusCircle className="w-4 h-4" />
            <span>إيداع نقدية (+)</span>
          </button>

          <button
            onClick={() => {
              setTxTitle("");
              setTxNotes("");
              setTxAmount("");
              setShowTxModal("withdrawal");
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-rose-600/20"
          >
            <Lucide.MinusCircle className="w-4 h-4" />
            <span>سحب نقدية (-)</span>
          </button>

          <button
            onClick={copyWhatsAppReport}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="نسخ تقرير منسق لمشاركته عبر الواتساب"
          >
            {copiedSuccess ? (
              <>
                <Lucide.Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700 font-black">تم النسخ بنجاح!</span>
              </>
            ) : (
              <>
                <Lucide.Share2 className="w-4 h-4 text-emerald-600" />
                <span>نسخ للواتساب</span>
              </>
            )}
          </button>

          <a
            href={`/print/statement/treasury/${id}${fromDate || toDate ? `?from_date=${fromDate}&to_date=${toDate}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <Lucide.Printer className="w-4 h-4" />
            <span>طباعة / PDF</span>
          </a>
        </div>
      </div>

      {/* Financial Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-bold">الرصيد الافتتاحي</span>
              <span className="text-sm">💵</span>
            </div>
            <div className="text-lg sm:text-xl font-black text-slate-800 font-mono">
              {formatEGP(data.summary.opening_balance)} <span className="text-xs text-slate-500 font-normal">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-xs font-bold">إجمالي الوارد (+)</span>
              <Lucide.ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-lg sm:text-xl font-black text-emerald-600 font-mono">
              +{formatEGP(data.summary.period_in)} <span className="text-xs text-emerald-700 font-normal">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-sm">
            <div className="flex items-center justify-between text-rose-700 mb-1">
              <span className="text-xs font-bold">إجمالي المنصرف (-)</span>
              <Lucide.ArrowUpRight className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-lg sm:text-xl font-black text-rose-600 font-mono">
              -{formatEGP(data.summary.period_out)} <span className="text-xs text-rose-700 font-normal">ج</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-4 rounded-2xl text-white shadow-md">
            <div className="flex items-center justify-between text-blue-100 mb-1">
              <span className="text-xs font-bold">الرصيد الحالي اللحظي</span>
              <Lucide.Wallet className="w-4 h-4 text-blue-200" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono">
              {formatEGP(data.treasury.current_balance)} <span className="text-xs text-blue-200 font-normal">ج</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-4 p-4 sm:p-6">
        {/* Filters Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Lucide.Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="بحث بالبيان، الطرف، الملاحظات..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pr-9 pl-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
              />
            </div>

            {/* In / Out Tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  typeFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("in")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  typeFilter === "in" ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-700 hover:text-emerald-800"
                }`}
              >
                الوارد (+)
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("out")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  typeFilter === "out" ? "bg-rose-600 text-white shadow-sm" : "text-rose-700 hover:text-rose-800"
                }`}
              >
                المنصرف (-)
              </button>
            </div>

            {/* Date Filters */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="text-slate-400 font-bold">من:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold"
              />
              <span className="text-slate-400 font-bold">إلى:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold"
              />
              {(fromDate || toDate || search || typeFilter !== "all") && (
                <button
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setSearch("");
                    setTypeFilter("all");
                  }}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  title="إلغاء الفلاتر"
                >
                  <Lucide.RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="text-xs text-slate-500 font-bold text-left shrink-0">
            عدد الحركات: <span className="text-slate-800 font-mono">{data?.items?.length || 0}</span>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs sm:text-sm text-right">
            <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th className="p-3">التاريخ والوقت</th>
                <th className="p-3">نوع الحركة</th>
                <th className="p-3">البيان / الطرف</th>
                <th className="p-3 text-emerald-700">الوارد (+)</th>
                <th className="p-3 text-rose-700">المنصرف (-)</th>
                <th className="p-3 font-mono">الرصيد بعد الحركة</th>
                <th className="p-3">الملاحظات</th>
                <th className="p-3">المسؤول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                    ⏳ جاري تحميل كشف حساب الخزينة...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-rose-600 font-bold">
                    ❌ {error}
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-semibold">
                    لا توجد حركات مسجلة لهذه الخزينة في الفترة المحددة
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="p-3 font-mono text-slate-600 whitespace-nowrap text-xs">
                      {formatDate(item.date)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          item.amountIn > 0
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {item.amountIn > 0 ? "🟢" : "🔴"} {item.category}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {item.label}
                    </td>
                    <td className="p-3 font-black text-emerald-600 font-mono whitespace-nowrap">
                      {item.amountIn > 0 ? `+${formatEGP(item.amountIn)} ج` : "—"}
                    </td>
                    <td className="p-3 font-black text-rose-600 font-mono whitespace-nowrap">
                      {item.amountOut > 0 ? `-${formatEGP(item.amountOut)} ج` : "—"}
                    </td>
                    <td className="p-3 font-black text-slate-900 font-mono whitespace-nowrap bg-slate-50/50">
                      {formatEGP(item.balance)} ج
                    </td>
                    <td className="p-3 text-slate-500 text-xs max-w-xs truncate">
                      {item.notes || "—"}
                    </td>
                    <td className="p-3 text-slate-600 text-xs whitespace-nowrap font-medium">
                      {item.user || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {data && data.items.length > 0 && (
              <tfoot className="bg-slate-50 font-black border-t-2 border-slate-200 text-slate-800">
                <tr>
                  <td colSpan={3} className="p-3 text-left">
                    إجمالي الفترة المحددة:
                  </td>
                  <td className="p-3 text-emerald-700 font-mono text-sm">
                    +{formatEGP(data.summary.period_in)} ج
                  </td>
                  <td className="p-3 text-rose-700 font-mono text-sm">
                    -{formatEGP(data.summary.period_out)} ج
                  </td>
                  <td colSpan={3} className="p-3 text-slate-900 font-mono text-sm">
                    الرصيد الفعلي: {formatEGP(data.treasury.current_balance)} ج
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Direct Transaction Modal (إيداع / سحب مباشر) */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
                {showTxModal === "deposit" ? (
                  <>
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <Lucide.PlusCircle className="w-5 h-5" />
                    </div>
                    <span>إيداع نقدي مباشر للخزينة (+)</span>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                      <Lucide.MinusCircle className="w-5 h-5" />
                    </div>
                    <span>سحب نقدي مباشر من الخزينة (-)</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setShowTxModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <Lucide.X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDirectTransaction} className="mt-4 space-y-4">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700 flex justify-between items-center">
                <span>الخزينة المستهدفة:</span>
                <span className="font-bold text-slate-900">{data?.treasury?.name}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className={`w-full h-11 px-3.5 border rounded-xl text-lg font-black font-mono outline-none ${
                    showTxModal === "deposit"
                      ? "text-emerald-700 border-emerald-200 focus:ring-2 focus:ring-emerald-500"
                      : "text-rose-700 border-rose-200 focus:ring-2 focus:ring-rose-500"
                  }`}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان / سبب الحركة *</label>
                <input
                  type="text"
                  required
                  placeholder={
                    showTxModal === "deposit"
                      ? "مثال: توريد نقدية من الإدارة، سحب من البنك، تغذية عهدة..."
                      : "مثال: إيداع في البنك، عهدة نقدية، سحب نقدي حر..."
                  }
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ *</label>
                <input
                  type="date"
                  required
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية (اختياري)</label>
                <input
                  type="text"
                  placeholder="أي تفاصيل أخرى..."
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full h-11 px-3.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={txSubmitting}
                  className={`flex-1 h-11 rounded-xl text-white font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                    showTxModal === "deposit"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                  }`}
                >
                  {txSubmitting ? "جاري الحفظ..." : showTxModal === "deposit" ? "تأكيد الإيداع (+)" : "تأكيد السحب (-)"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTxModal(null)}
                  className="px-5 h-11 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
