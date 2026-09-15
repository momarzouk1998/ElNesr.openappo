"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import PaymentReceiptModal from "@/components/PaymentReceiptModal";
import CustomerAdjustmentReceiptModal from "@/components/CustomerAdjustmentReceiptModal";
import CustomerAdjustmentModal from "@/components/CustomerAdjustmentModal";
import CustomerPaymentModal from "@/components/CustomerPaymentModal";

interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  customer?: { id: string; name: string; phone: string | null } | null;
  treasury?: { id: string; name: string } | null;
  creator?: { id: number; full_name: string } | null;
}

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

type UnifiedItem =
  | { kind: "payment"; id: string; date: string; amount: number; methodOrType: string; notes: string | null; customer?: { id: string; name: string; phone: string | null } | null; treasury?: { id: string; name: string } | null; raw: Payment }
  | { kind: "adjustment"; id: string; date: string; amount: number; methodOrType: string; notes: string | null; isDebit: boolean; customer?: { id: string; name: string; phone: string | null } | null; treasury?: { id: string; name: string } | null; raw: AdjustmentRow };

export default function CustomerPaymentsPage() {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "payment" | "advance">("all");
  const [selectedPaymentReceiptId, setSelectedPaymentReceiptId] = useState<string | null>(null);
  const [selectedAdjustmentReceiptId, setSelectedAdjustmentReceiptId] = useState<string | null>(null);

  const { data: payData, loading: payLoading, refetch: refetchPay } = useApi<{ items: Payment[]; total: number; total_amount: number }>("/api/payments/customers?limit=500");
  const { data: adjData, loading: adjLoading, refetch: refetchAdj } = useApi<{ items: AdjustmentRow[]; total: number; total_debit: number; total_credit: number }>("/api/customers/adjustments?limit=500");

  const payments = payData?.items || [];
  const adjustments = adjData?.items || [];

  const totalPay = payData?.total_amount || 0;
  const totalAdv = adjData?.total_debit || 0;
  const net = totalPay - totalAdv;

  const unified: UnifiedItem[] = [
    ...payments.map((p): UnifiedItem => ({
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
    ...adjustments.map((a): UnifiedItem => ({
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

  const filtered = unified.filter((item) => {
    if (typeFilter === "payment" && item.kind !== "payment") return false;
    if (typeFilter === "advance" && item.kind !== "adjustment") return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.customer?.name?.toLowerCase().includes(q) ||
      item.customer?.phone?.includes(q) ||
      item.notes?.toLowerCase().includes(q) ||
      item.treasury?.name?.toLowerCase().includes(q)
    );
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
      refetchPay();
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
        alert("❌ " + (json?.error?.message || "فشل في الحذف"));
        return;
      }
      alert("✅ تم حذف السلفة وإعادة ضبط الرصيد بنجاح");
      refetchAdj();
    } catch {
      alert("❌ حدث خطأ أثناء الحذف");
    }
  }

  const loading = payLoading || adjLoading;

  return (
    <div className="space-y-4">
      {/* Top summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-xs font-bold text-emerald-800 block mb-1">💰 إجمالي التحصيلات</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
            {formatEGP(totalPay)} <span className="text-xs font-normal">ج.م</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">{payments.length} حركة تحصيل</span>
        </div>

        <div className="card p-4 border border-amber-100 bg-gradient-to-br from-amber-50/50 to-white">
          <span className="text-xs font-bold text-amber-800 block mb-1">💸 إجمالي سلف العملاء</span>
          <div className="text-xl sm:text-2xl font-black text-amber-700 font-mono">
            {formatEGP(totalAdv)} <span className="text-xs font-normal">ج.م</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">{adjustments.length} حركة سلفة / تسوية</span>
        </div>

        <div className="card p-4 border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <span className="text-xs font-bold text-slate-700 block mb-1">📊 صافي السيولة</span>
          <div className={`text-xl sm:text-2xl font-black font-mono ${net >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
            {formatEGP(net)} <span className="text-xs font-normal">ج.م</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">(التحصيلات − السلف)</span>
        </div>
      </div>

      {/* Header and Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTypeFilter("all")}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              typeFilter === "all" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            الكل ({unified.length})
          </button>
          <button
            onClick={() => setTypeFilter("payment")}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              typeFilter === "payment" ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            💰 التحصيلات فقط ({payments.length})
          </button>
          <button
            onClick={() => setTypeFilter("advance")}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              typeFilter === "advance" ? "bg-amber-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            💸 سلف العملاء فقط ({adjustments.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPaymentModal(true)}
            className="btn-primary text-xs sm:text-sm py-2 px-3.5 shadow-sm"
          >
            + تحصيل جديد
          </button>
          <button
            onClick={() => setShowAdvanceModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs sm:text-sm transition-all shadow-sm cursor-pointer"
          >
            + سلفة لعميل 💸
          </button>
        </div>
      </div>

      {/* Search */}
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
              {filtered.map((item) => {
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400 font-bold">
                    لا توجد حركات مطابقة للبحث أو الفلتر
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <CustomerPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={() => {
          setShowPaymentModal(false);
          refetchPay();
        }}
      />

      <CustomerAdjustmentModal
        isOpen={showAdvanceModal}
        onClose={() => setShowAdvanceModal(false)}
        onSuccess={() => {
          setShowAdvanceModal(false);
          refetchAdj();
        }}
      />

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
