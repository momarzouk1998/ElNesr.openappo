"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const router = useRouter();
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
        setError(json?.error?.message || "فشل تحميل كشف الخزينة");
        return;
      }
      setData(json.data);
    } catch (e: any) {
      setError("حدث خطأ أثناء تحميل كشف الحساب");
    } finally {
      setLoading(false);
    }
  }, [id, fromDate, toDate, typeFilter, search]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  // Handle Save Direct Transaction from inside Statement page
  async function handleSaveDirectTx(e: React.FormEvent) {
    e.preventDefault();
    if (!showTxModal) return;
    if (!txAmount || Number(txAmount) <= 0) return alert("يرجى إدخال مبلغ صحيح أكبر من الصفر");

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
          title: txTitle.trim(),
          notes: txNotes.trim(),
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

  // Generate and copy WhatsApp Formatted Statement
  function copyWhatsAppStatement() {
    if (!data) return;

    const t = data.treasury;
    const s = data.summary;
    const fPeriod = fromDate || toDate ? `من ${fromDate || 'البداية'} إلى ${toDate || 'الآن'}` : "كامل الفترة";

    let text = `🦅 *شركة النسر للأدوات واللوحات الكهربائية*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏦 *كشف حساب خزينة:* ${t.name} (${t.type})\n`;
    if (t.assigned_user) text += `👤 *المسئول:* ${t.assigned_user}\n`;
    text += `📅 *الفترة:* ${fPeriod}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💵 *الرصيد الافتتاحي:* ${formatEGP(s.opening_balance)} ج.م\n`;
    text += `🟢 *إجمالي الوارد (+):* ${formatEGP(s.period_in)} ج.م\n`;
    text += `🔴 *إجمالي المنصرف (-):* ${formatEGP(s.period_out)} ج.م\n`;
    text += `⚖️ *صافي حركة الفترة:* ${formatEGP(s.period_net)} ج.م\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💰 *الرصيد الحالي بالخزينة:* ${formatEGP(t.current_balance)} ج.م\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    const items = data.items || [];
    text += `📋 *سجل حركات الخزينة بالتفصيل (${items.length} حركة):*\n`;

    if (items.length === 0) {
      text += `• لا توجد حركات مسجلة بهذه الفترة\n`;
    } else {
      items.forEach((item, idx) => {
        const sign = item.type === "in" ? "🟢 وارد: +" : "🔴 صادر: -";
        const amt = formatEGP(item.type === "in" ? item.amountIn : item.amountOut);
        const dStr = item.date ? item.date.slice(0, 10) : "";
        const balStr = `(رصيد: ${formatEGP(item.balance)} ج)`;
        text += `${idx + 1}. 📅 ${dStr} | ${sign}${amt} ج.م | ${balStr}\n   📝 البيان: ${item.label}\n`;
        if (item.notes && item.notes !== item.label) {
          text += `   💬 ملاحظات: ${item.notes}\n`;
        }
        text += `──────────────────\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⏰ تم استخراج التقرير: ${new Date().toLocaleString("ar-EG")}\n`;

    navigator.clipboard.writeText(text);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 3000);
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href="/treasury"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
        >
          <Lucide.ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة الخزائن</span>
        </Link>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setShowTxModal("deposit");
              setTxTitle("توريد نقدية مباشر / تغذية خزينة");
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Lucide.PlusCircle className="w-4 h-4" />
            <span>إيداع نقدية (+)</span>
          </button>

          <button
            onClick={() => {
              setShowTxModal("withdrawal");
              setTxTitle("سحب نقدي مباشر / عهدة");
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Lucide.MinusCircle className="w-4 h-4" />
            <span>سحب نقدية (-)</span>
          </button>

          <button
            onClick={copyWhatsAppStatement}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="نسخ كشف حساب منسق وجاهز للإرسال على الواتساب"
          >
            {copiedSuccess ? <Lucide.Check className="w-4 h-4" /> : <Lucide.Share2 className="w-4 h-4" />}
            <span>{copiedSuccess ? "تم نسخ تقرير الواتساب! ✓" : "نسخ للواتساب 📲"}</span>
          </button>

          <a
            href={`/print/statement/treasury/${id}?from_date=${fromDate}&to_date=${toDate}&type=${typeFilter}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Lucide.Printer className="w-4 h-4" />
            <span>طباعة / تصدير PDF</span>
          </a>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center text-3xl shadow-sm">
            🏦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-slate-800">
                كشف حساب: {data?.treasury.name || "جاري التحميل..."}
              </h1>
              {data?.treasury && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                  {data.treasury.type}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {data?.treasury.assigned_user ? `👤 المسئول: ${data.treasury.assigned_user} • ` : ""}
              سجل تفصيلي دقيق لكافة الحركات النقدية والرصيد التراكمي اللحظي
            </p>
          </div>
        </div>

        {data && (
          <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-left shrink-0">
            <span className="text-[11px] font-bold text-emerald-800 block">الرصيد الحالي بالخزينة</span>
            <span className="text-2xl font-black text-emerald-700 font-mono">
              {formatEGP(data.treasury.current_balance)} <span className="text-xs font-normal">ج.م</span>
            </span>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 block mb-1">الرصيد الافتتاحي</span>
            <div className="text-lg md:text-xl font-black text-slate-800 font-mono">
              {formatEGP(data.summary.opening_balance)} <span className="text-xs font-normal text-slate-400">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-100 bg-emerald-50/20 shadow-sm">
            <span className="text-[11px] font-bold text-emerald-700 block mb-1">🟢 إجمالي الوارد بالفترة</span>
            <div className="text-lg md:text-xl font-black text-emerald-600 font-mono">
              +{formatEGP(data.summary.period_in)} <span className="text-xs font-normal text-slate-400">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-rose-100 bg-rose-50/20 shadow-sm">
            <span className="text-[11px] font-bold text-rose-700 block mb-1">🔴 إجمالي المنصرف بالفترة</span>
            <div className="text-lg md:text-xl font-black text-rose-600 font-mono">
              -{formatEGP(data.summary.period_out)} <span className="text-xs font-normal text-slate-400">ج</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 block mb-1">⚖️ صافي حركة الفترة</span>
            <div
              className={`text-lg md:text-xl font-black font-mono ${
                data.summary.period_net >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {data.summary.period_net >= 0 ? "+" : ""}
              {formatEGP(data.summary.period_net)} <span className="text-xs font-normal text-slate-400">ج</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Lucide.Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="بحث في البيان، الطرف، الملاحظات..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pr-9 pl-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
              />
            </div>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="py-2 px-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">جميع الحركات (الوارد والمنصرف)</option>
              <option value="in">🟢 الوارد فقط (+)</option>
              <option value="out">🔴 المنصرف فقط (-)</option>
            </select>

            {/* Date Filters */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="text-slate-400 font-bold">من:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
              />
              <span className="text-slate-400 font-bold">إلى:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
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
            عدد الحركات المعروضة: <span className="text-slate-800 font-mono">{data?.items.length || 0}</span>
          </div>
        </div>
      </div>

      {/* Statement Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 whitespace-nowrap">التاريخ</th>
                <th className="p-3 whitespace-nowrap">نوع الحركة / التصنيف</th>
                <th className="p-3">البيان والتفاصيل</th>
                <th className="p-3 whitespace-nowrap text-emerald-700">وارد (+)</th>
                <th className="p-3 whitespace-nowrap text-rose-700">منصرف (-)</th>
                <th className="p-3 whitespace-nowrap text-slate-900">الرصيد اللحظي</th>
                <th className="p-3 whitespace-nowrap">المسئول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 font-bold">
                    ⏳ جاري تحميل كشف الحساب...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-rose-600 font-bold">
                    ❌ {error}
                  </td>
                </tr>
              ) : (data?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 font-semibold">
                    لا توجد حركات مسجلة بالخزينة مطابقة للفلاتر
                  </td>
                </tr>
              ) : (
                data?.items.map((item) => {
                  const isIn = item.type === "in";
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{formatDate(item.date)}</td>

                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            isIn
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          <span>{isIn ? "🟢" : "🔴"}</span>
                          <span>{item.category}</span>
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-slate-800">{item.label}</div>
                        {item.notes && item.notes !== item.label && (
                          <div className="text-xs text-slate-500 font-normal mt-0.5">{item.notes}</div>
                        )}
                      </td>

                      <td className="p-3 font-mono font-extrabold text-emerald-600 whitespace-nowrap">
                        {item.amountIn > 0 ? `+${formatEGP(item.amountIn)} ج` : "—"}
                      </td>

                      <td className="p-3 font-mono font-extrabold text-rose-600 whitespace-nowrap">
                        {item.amountOut > 0 ? `-${formatEGP(item.amountOut)} ج` : "—"}
                      </td>

                      <td className="p-3 font-mono font-black text-slate-900 whitespace-nowrap text-sm bg-slate-50/50">
                        {formatEGP(item.balance)} ج
                      </td>

                      <td className="p-3 text-slate-600 text-xs whitespace-nowrap">{item.user || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {data && data.items.length > 0 && (
              <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300 text-slate-800">
                <tr>
                  <td colSpan={3} className="p-3 text-left">
                    إجمالي حركات الفترة المفلترة:
                  </td>
                  <td className="p-3 font-mono text-emerald-700 whitespace-nowrap">
                    +{formatEGP(data.summary.period_in)} ج
                  </td>
                  <td className="p-3 font-mono text-rose-700 whitespace-nowrap">
                    -{formatEGP(data.summary.period_out)} ج
                  </td>
                  <td className="p-3 font-mono text-slate-900 text-base whitespace-nowrap">
                    {formatEGP(data.treasury.current_balance)} ج
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Direct Transaction Modal inside Statement Page */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                    showTxModal === "deposit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {showTxModal === "deposit" ? (
                    <Lucide.PlusCircle className="w-6 h-6" />
                  ) : (
                    <Lucide.MinusCircle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">
                    {showTxModal === "deposit" ? "إيداع نقدي مباشر (+)" : "سحب نقدي مباشر (-)"}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-semibold">في خزينة: {data?.treasury.name}</p>
                </div>
              </div>
              <button onClick={() => setShowTxModal(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <Lucide.X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDirectTx} className="space-y-3.5 text-xs font-bold text-slate-700">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">المبلغ (ج.م) *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="0.00"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className={`w-full h-11 px-3 border border-slate-200 rounded-xl text-base font-black font-mono focus:ring-2 outline-none ${
                      showTxModal === "deposit"
                        ? "text-emerald-600 focus:ring-emerald-600"
                        : "text-rose-600 focus:ring-rose-600"
                    }`}
                  />
                </div>
                <div>
                  <label className="block mb-1">التاريخ *</label>
                  <input
                    required
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full h-11 px-3 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1">البيان الأساسي *</label>
                <input
                  required
                  type="text"
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  placeholder={
                    showTxModal === "deposit" ? "مثال: توريد نقدية من الإدارة..." : "مثال: عهدة مؤقتة، إيداع بنكي..."
                  }
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block mb-1">ملاحظات إضافية (اختياري)</label>
                <textarea
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="أي تفاصيل أخرى..."
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-normal focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={txSubmitting}
                  className={`flex-1 h-11 rounded-xl text-white font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                    showTxModal === "deposit"
                      ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                      : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                  }`}
                >
                  {txSubmitting ? "جاري التسجيل..." : showTxModal === "deposit" ? "تأكيد الإيداع (+)" : "تأكيد الصرف (-)"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTxModal(null)}
                  className="h-11 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
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
