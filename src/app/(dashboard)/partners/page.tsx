"use client";

import React, { useEffect, useState, useCallback } from "react";
import { formatEGP, formatDate } from "@/lib/format";
import * as Lucide from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Partner {
  id: string;
  name: string;
  phone: string | null;
  share_percentage: number | null;
  notes: string | null;
  totalWithdrawn?: number;
  withdrawalsCount?: number;
}

interface WithdrawalItem {
  id: string;
  partner_id: string;
  amount: number;
  withdrawal_date: string;
  notes: string | null;
  partner: { id: string; name: string; phone: string | null };
  treasury: { id: string; name: string } | null;
}

interface TreasuryOption {
  id: string;
  name: string;
  current_balance: number;
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [partnerTotals, setPartnerTotals] = useState<{ partner_id: string; total: number; count: number }[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [treasuries, setTreasuries] = useState<TreasuryOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Pagination
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modals
  const [showAddPartner, setShowAddPartner] = useState<boolean>(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [showAddWithdrawal, setShowAddWithdrawal] = useState<boolean>(false);
  const [deletingWithdrawal, setDeletingWithdrawal] = useState<WithdrawalItem | null>(null);

  // Load Partners list
  const loadPartners = useCallback(async () => {
    try {
      const res = await fetch("/api/partners");
      const json = await res.json();
      if (json.ok) {
        const list = Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.data?.items)
          ? json.data.items
          : [];
        setPartners(list);
      }
    } catch (e) {
      console.error("Error loading partners:", e);
    }
  }, []);

  // Load Treasuries list
  const loadTreasuries = useCallback(async () => {
    try {
      const res = await fetch("/api/treasury");
      const json = await res.json();
      if (json.ok) {
        const list = Array.isArray(json.data?.items)
          ? json.data.items
          : Array.isArray(json.data)
          ? json.data
          : [];
        setTreasuries(list);
      }
    } catch (e) {
      console.error("Error loading treasuries:", e);
    }
  }, []);

  // Load Withdrawals
  const loadWithdrawals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedPartnerId) params.set("partner_id", selectedPartnerId);
      if (search.trim()) params.set("search", search.trim());
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/partners/withdrawals?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setWithdrawals(json.data?.items || []);
        setTotalAmount(json.data?.totalAmount || 0);
        setPartnerTotals(json.data?.partnerTotals || []);
        setTotalPages(json.data?.pagination?.totalPages || 1);
        setTotalCount(json.data?.pagination?.total || 0);
      }
    } catch (e) {
      console.error("Error loading withdrawals:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedPartnerId, search, fromDate, toDate, page]);

  useEffect(() => {
    loadPartners();
    loadTreasuries();
  }, [loadPartners, loadTreasuries]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  // Quick helper to get partner total (either from active filter or base)
  const getPartnerFilteredTotal = (pId: string) => {
    const pt = partnerTotals.find((t) => t.partner_id === pId);
    return pt ? pt.total : 0;
  };

  // Confirm delete withdrawal
  async function confirmDeleteWithdrawal() {
    if (!deletingWithdrawal) return;
    try {
      const res = await fetch(`/api/partners/withdrawals/${deletingWithdrawal.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "فشل في الحذف"));
        return;
      }
      alert("✅ تم حذف حركة السحب بنجاح");
      setDeletingWithdrawal(null);
      loadWithdrawals();
      loadPartners();
      loadTreasuries();
    } catch {
      alert("❌ حدث خطأ أثناء الحذف");
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center text-2xl shadow-sm">
            🤝
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800">مسحوبات الشركاء</h1>
            <p className="text-xs text-slate-500 mt-0.5">إدارة حسابات الشركاء، تسجيل ومتابعة المسحوبات مع الربط التلقائي بالخزائن</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowAddPartner(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm border border-slate-200"
          >
            <Lucide.UserPlus className="w-4 h-4 text-slate-600" />
            <span>إضافة شريك</span>
          </button>
          <button
            onClick={() => setShowAddWithdrawal(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs sm:text-sm font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md hover:shadow-lg shadow-amber-500/20 hover:scale-[1.02]"
          >
            <Lucide.PlusCircle className="w-4 h-4" />
            <span>تسجيل سحب جديد</span>
          </button>
        </div>
      </div>

      {/* Partner Cards Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Lucide.Wallet className="w-4 h-4 text-amber-600" />
            <span>كروت الشركاء والمسحوبات</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {selectedPartnerId || fromDate || toDate ? "(أرقام الفلترة الحالية)" : "(الإجمالي الكلي)"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* General Total Card */}
          <div
            onClick={() => { setSelectedPartnerId(""); setPage(1); }}
            className={`cursor-pointer rounded-2xl p-4 border transition-all duration-200 shadow-sm relative overflow-hidden ${
              selectedPartnerId === ""
                ? "bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/40 ring-2 ring-amber-500/20"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 block mb-1">إجمالي مسحوبات الشركاء</span>
                <div className="text-xl md:text-2xl font-black text-amber-600 font-mono">
                  {formatEGP(totalAmount)} <span className="text-xs text-slate-500 font-normal">ج.م</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                <Lucide.Coins className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-500 font-semibold border-t border-black/5 pt-2 flex items-center justify-between">
              <span>{withdrawals.length} حركة سحب</span>
              <span className="text-amber-700 font-bold">{selectedPartnerId === "" ? "الكل نشط ✓" : "عرض الكل"}</span>
            </div>
          </div>

          {/* Individual Partner Cards */}
          {(partners || []).map((p) => {
            const isSelected = selectedPartnerId === p.id;
            const partnerWithdrawn = selectedPartnerId || fromDate || toDate ? getPartnerFilteredTotal(p.id) : (p.totalWithdrawn || 0);

            return (
              <div
                key={p.id}
                onClick={() => { setSelectedPartnerId(isSelected ? "" : p.id); setPage(1); }}
                className={`group cursor-pointer rounded-2xl p-4 border transition-all duration-200 shadow-sm relative overflow-hidden ${
                  isSelected
                    ? "bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent border-blue-500/40 ring-2 ring-blue-500/20"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:shadow"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-800 truncate block">{p.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPartner(p);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-all"
                        title="تعديل بيانات الشريك"
                      >
                        <Lucide.Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-lg md:text-xl font-black text-slate-900 font-mono mt-1">
                      {formatEGP(partnerWithdrawn)} <span className="text-xs text-slate-500 font-normal">ج.م</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                    <Lucide.User className="w-4 h-4" />
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-slate-500 font-semibold border-t border-black/5 pt-2 flex items-center justify-between">
                  <span className="truncate font-mono text-[10px]">{p.phone || "بدون هاتف"}</span>
                  <span className={isSelected ? "text-blue-700 font-bold" : "text-slate-400"}>
                    {isSelected ? "مُحدد ✓" : "فلترة بالسحب"}
                  </span>
                </div>
              </div>
            );
          })}

          {partners.length === 0 && (
            <div className="col-span-full bg-white p-6 rounded-2xl border border-dashed border-slate-300 text-center text-slate-500 space-y-2">
              <p className="text-sm font-bold">لا يوجد شركاء مسجلين حتى الآن</p>
              <button onClick={() => setShowAddPartner(true)} className="btn-secondary text-xs">+ إضافة أول شريك (مثل: أدم، عبد الله...)</button>
            </div>
          )}
        </div>
      </div>

      {/* Withdrawals Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-4 p-4 sm:p-6">
        {/* Filters bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Lucide.Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="بحث بالبيان أو اسم الشريك..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pr-9 pl-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
              />
            </div>

            {/* Partner select filter */}
            <select
              value={selectedPartnerId}
              onChange={(e) => { setSelectedPartnerId(e.target.value); setPage(1); }}
              className="py-2 px-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold text-slate-700"
            >
              <option value="">جميع الشركاء</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* Date Filters */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="text-slate-400 font-bold">من:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
              />
              <span className="text-slate-400 font-bold">إلى:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
              />
              {(fromDate || toDate || selectedPartnerId || search) && (
                <button
                  onClick={() => { setFromDate(""); setToDate(""); setSelectedPartnerId(""); setSearch(""); setPage(1); }}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  title="إلغاء الفلاتر"
                >
                  <Lucide.RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="text-xs text-slate-500 font-bold text-left shrink-0">
            عدد الحركات: <span className="text-slate-800 font-mono">{totalCount}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-xs sm:text-sm text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">التاريخ</th>
                <th className="p-3">الشريك</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">الخزينة المسحوب منها</th>
                <th className="p-3">البيان / ملاحظات</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                    ⏳ جاري تحميل المسحوبات...
                  </td>
                </tr>
              ) : withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-semibold">
                    لا توجد مسحوبات مسجلة مطابقة للبحث أو الفلتر
                  </td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="p-3 font-mono font-medium text-slate-600 whitespace-nowrap">
                      {formatDate(w.withdrawal_date)}
                    </td>
                    <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-700">
                          {w.partner?.name?.charAt(0) || "-"}
                        </div>
                        <span>{w.partner?.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-black text-rose-600 font-mono text-sm whitespace-nowrap">
                      {formatEGP(w.amount)} ج
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {w.treasury ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                          <Lucide.Landmark className="w-3 h-3" />
                          <span>{w.treasury.name}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">— سحب نقدي مباشر</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-700 font-medium max-w-xs truncate">
                      {w.notes || "مسحوبات شخصية"}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => setDeletingWithdrawal(w)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors font-bold cursor-pointer"
                        title="حذف حركة السحب"
                      >
                        <Lucide.Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {withdrawals.length > 0 && (
              <tfoot className="bg-slate-50 font-black border-t-2 border-slate-200 text-slate-800">
                <tr>
                  <td colSpan={2} className="p-3 text-left">
                    إجمالي الصفحة:
                  </td>
                  <td className="p-3 text-rose-700 font-mono text-base">
                    {formatEGP(withdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0))} ج
                  </td>
                  <td colSpan={3} className="p-3 text-left text-xs text-slate-500 font-normal">
                    (الإجمالي الشامل المحدد: {formatEGP(totalAmount)} ج)
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pt-3 flex items-center justify-between border-t border-slate-100 flex-wrap gap-2 text-xs">
            <span className="text-slate-500 font-bold">
              صفحة {page} من {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                السابق
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((pNum) => pNum === 1 || pNum === totalPages || Math.abs(pNum - page) <= 1)
                .map((pNum) => (
                  <button
                    key={pNum}
                    onClick={() => setPage(pNum)}
                    className={`w-8 h-8 rounded-lg font-bold transition-all cursor-pointer ${
                      page === pNum
                        ? "bg-amber-500 text-slate-900 shadow-sm"
                        : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    {pNum}
                  </button>
                ))}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Partner Modal */}
      {showAddPartner && (
        <AddPartnerModal
          onClose={() => setShowAddPartner(false)}
          onSuccess={() => {
            setShowAddPartner(false);
            loadPartners();
          }}
        />
      )}

      {/* Edit Partner Modal */}
      {editingPartner && (
        <EditPartnerModal
          partner={editingPartner}
          onClose={() => setEditingPartner(null)}
          onSuccess={() => {
            setEditingPartner(null);
            loadPartners();
          }}
        />
      )}

      {/* Add Withdrawal Modal */}
      {showAddWithdrawal && (
        <AddWithdrawalModal
          partners={partners}
          treasuries={treasuries}
          onClose={() => setShowAddWithdrawal(false)}
          onSuccess={() => {
            setShowAddWithdrawal(false);
            loadWithdrawals();
            loadPartners();
            loadTreasuries();
          }}
        />
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deletingWithdrawal}
        type="danger"
        title="حذف حركة سحب شريك"
        message={
          deletingWithdrawal
            ? `هل أنت متأكد من حذف حركة سحب بمبلغ ${formatEGP(deletingWithdrawal.amount)} ج للشريك (${deletingWithdrawal.partner?.name})؟\n\nسيتم إلغاء السحب واسترجاع المبلغ للخزينة إن وُجدت.`
            : ""
        }
        confirmText="نعم، احذف"
        cancelText="إلغاء"
        onConfirm={confirmDeleteWithdrawal}
        onCancel={() => setDeletingWithdrawal(null)}
      />
    </div>
  );
}

/* ========================================================
   Add Partner Modal Component
======================================================== */
function AddPartnerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("يرجى كتابة اسم الشريك");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, notes }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "فشل في إضافة الشريك"));
        return;
      }
      alert("✅ تم إضافة الشريك بنجاح");
      onSuccess();
    } catch {
      alert("❌ حدث خطأ في الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-scale-up">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span>👤</span>
            <span>إضافة شريك جديد</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشريك *</label>
            <input
              type="text"
              placeholder="مثال: أدم / عبد الله / مصطفى..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف (اختياري)</label>
            <input
              type="text"
              placeholder="010xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات (اختياري)</label>
            <textarea
              placeholder="أي تفاصيل إضافية عن الشراكة أو النسبة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? "جاري الحفظ..." : "حفظ الشريك"}
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

/* ========================================================
   Edit Partner Modal Component
======================================================== */
function EditPartnerModal({ partner, onClose, onSuccess }: { partner: Partner; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(partner.name);
  const [phone, setPhone] = useState(partner.phone || "");
  const [notes, setNotes] = useState(partner.notes || "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("يرجى كتابة اسم الشريك");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/partners/${partner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, notes }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "فشل في تعديل بيانات الشريك"));
        return;
      }
      alert("✅ تم تعديل بيانات الشريك بنجاح");
      onSuccess();
    } catch {
      alert("❌ حدث خطأ في الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-scale-up">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span>✏️</span>
            <span>تعديل بيانات الشريك</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشريك *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف (اختياري)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات (اختياري)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? "جاري التحديث..." : "تحديث البيانات"}
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

/* ========================================================
   Add Withdrawal Modal Component
======================================================== */
function AddWithdrawalModal({
  partners,
  treasuries,
  onClose,
  onSuccess,
}: {
  partners: Partner[];
  treasuries: TreasuryOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const safePartners = Array.isArray(partners) ? partners : [];
  const safeTreasuries = Array.isArray(treasuries)
    ? treasuries
    : Array.isArray((treasuries as any)?.items)
    ? (treasuries as any).items
    : [];

  const [partnerId, setPartnerId] = useState(safePartners[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().split("T")[0]);
  const [treasuryId, setTreasuryId] = useState(safeTreasuries[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!partnerId && safePartners.length > 0) {
      setPartnerId(safePartners[0].id);
    }
  }, [safePartners, partnerId]);

  useEffect(() => {
    if (!treasuryId && safeTreasuries.length > 0) {
      setTreasuryId(safeTreasuries[0].id);
    }
  }, [safeTreasuries, treasuryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partnerId) {
      alert("يرجى اختيار الشريك");
      return;
    }
    const num = Number(amount);
    if (!num || num <= 0) {
      alert("يرجى كتابة مبلغ سحب صحيح أكبر من 0");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/partners/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_id: partnerId,
          amount: num,
          withdrawal_date: withdrawalDate,
          treasury_id: treasuryId || null,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert("❌ " + (json?.error?.message || "فشل في تسجيل السحب"));
        return;
      }
      alert("✅ تم تسجيل حركة السحب بنجاح وخصمها من الخزينة إن وُجدت");
      onSuccess();
    } catch {
      alert("❌ حدث خطأ أثناء الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-scale-up">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span>💸</span>
            <span>تسجيل سحب شريك جديد</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الشريك *</label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              required
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="">اختر الشريك...</option>
              {safePartners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

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
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-black font-mono text-rose-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ *</label>
              <input
                type="date"
                value={withdrawalDate}
                onChange={(e) => setWithdrawalDate(e.target.value)}
                required
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الخزينة المسحوب منها (اختياري)</label>
            <select
              value={treasuryId}
              onChange={(e) => setTreasuryId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="">بدون خصم من الخزينة (سحب نقدي خارج الخزائن)</option>
              {safeTreasuries.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (رصيدها: {formatEGP(t.current_balance)} ج)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البيان / ملاحظات (اختياري)</label>
            <input
              type="text"
              placeholder="مثال: سحب نقدي من الأرباح، مصاريف شخصية..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? "جاري التسجيل..." : "تأكيد السحب"}
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

