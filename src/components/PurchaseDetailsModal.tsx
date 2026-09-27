"use client";
import React, { useState } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate, statusColor } from "@/lib/format";

export function PurchaseDetailsModal({
  invoiceId,
  isAdmin,
  onClose,
  onChanged,
}: {
  invoiceId: string;
  isAdmin: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { data: inv, loading, refetch } = useApi<any>(`/api/purchases/invoices/${invoiceId}`);
  const { mutate } = useApiMutation();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");

  const isCompleted = inv?.status === "مكتملة";
  const isCancelled = inv?.status === "ملغاة";

  if (inv && status === "") {
    setStatus(inv.status);
    setNotes(inv.notes || "");
  }

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <div className="p-8 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">⏳ جاري التحميل...</p>
        </div>
      </ModalShell>
    );
  }

  if (!inv) {
    return (
      <ModalShell onClose={onClose}>
        <div className="p-8 text-center space-y-3">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على الفاتورة</p>
          <button onClick={onClose} className="btn-secondary text-sm">إغلاق</button>
        </div>
      </ModalShell>
    );
  }

  async function saveChanges() {
    const { error } = await mutate("PATCH", `/api/purchases/invoices/${invoiceId}`, { status, notes });
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert("✅ تم حفظ التعديلات");
    setEditing(false);
    refetch();
    if (onChanged) onChanged();
  }

  async function cancelInvoice() {
    if (!confirm("هل تريد إلغاء هذه الفاتورة؟")) return;
    const { error } = await mutate("DELETE", `/api/purchases/invoices/${invoiceId}`);
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert("✅ تم إلغاء الفاتورة");
    onClose();
    if (onChanged) onChanged();
  }

  async function deleteInvoice() {
    if (!confirm("⚠️ حذف نهائي — لا يمكن التراجع عنه. هل أنت متأكد؟")) return;
    if (!confirm("⚠️ تأكيد أخير؟")) return;
    const { error } = await mutate("DELETE", `/api/purchases/invoices/${invoiceId}?permanent=true`);
    if (error) {
      alert("❌ " + error);
      return;
    }
    alert("✅ تم الحذف النهائي");
    onClose();
    if (onChanged) onChanged();
  }

  return (
    <ModalShell onClose={onClose} wide>
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>📥 فاتورة مشتريات #{inv.purchase_number}</span>
            <span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span>
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{formatDate(inv.purchase_date)}</p>
        </div>
        <button onClick={onClose} className="text-2xl text-gray-400 hover:text-red-500 cursor-pointer">✕</button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm bg-slate-50 p-3 rounded-xl border border-slate-200">
          <Info label="المورد" value={inv.supplier?.name || "—"} />
          <Info label="المسئول / المنشئ" value={inv.creator?.full_name || "—"} />
          <Info label="تاريخ الفاتورة" value={formatDate(inv.purchase_date)} />
        </div>

        <div>
          <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <span>📦</span>
            <span>الأصناف المسجلة بالفاتورة ({inv.items?.length || 0}):</span>
          </h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-purple-50/70 border-b border-purple-100 text-purple-950">
                <tr>
                  <th className="p-2.5 text-right font-bold">الصنف</th>
                  <th className="p-2.5 text-center font-bold">الكمية</th>
                  <th className="p-2.5 text-left font-bold">سعر الشراء</th>
                  <th className="p-2.5 text-left font-bold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {inv.items?.map((it: any) => (
                  <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">{it.product_name}</td>
                    <td className="p-2.5 text-center font-mono font-black text-slate-900">{Number(it.quantity)}</td>
                    <td className="p-2.5 text-left font-mono text-slate-600">{formatEGP(Number(it.unit_cost))} ج</td>
                    <td className="p-2.5 text-left font-mono font-extrabold text-purple-800">{formatEGP(Number(it.line_total))} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between items-center text-lg font-extrabold border-t pt-3 text-slate-900 bg-slate-50 p-3 rounded-xl">
          <span>إجمالي الفاتورة:</span>
          <span className="font-mono text-xl text-purple-700 font-black">{formatEGP(Number(inv.total_amount))} ج</span>
        </div>

        {inv.notes && (
          <div className="text-xs text-gray-600 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
            📝 {inv.notes}
          </div>
        )}

        {editing && !isCompleted && !isCancelled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="text-xs text-gray-600 font-bold block mb-1">الحالة</label>
              <select className="input-field text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="قيد التنفيذ">قيد التنفيذ</option>
                <option value="مكتملة">مكتملة</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 font-bold block mb-1">ملاحظات</label>
              <textarea className="input-field text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-3 border-t">
          {editing ? (
            <>
              <button onClick={saveChanges} className="btn-primary text-sm">💾 حفظ</button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">إلغاء</button>
            </>
          ) : (
            <>
              {!isCompleted && !isCancelled && (
                <button onClick={() => setEditing(true)} className="btn-secondary text-sm">✏️ تعديل</button>
              )}
              {!isCancelled && (
                <button
                  onClick={cancelInvoice}
                  className={`text-sm px-4 py-2 rounded-lg font-semibold border transition ${
                    isAdmin ? "bg-red-600 text-white hover:bg-red-700 border-red-700" : "bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
                  }`}
                >
                  {isAdmin ? "⚠️ إلغاء (مدير)" : "🗑️ إلغاء الفاتورة"}
                </button>
              )}
              {isAdmin && (
                <button onClick={deleteInvoice} className="text-sm px-4 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800">
                  🗑️💀 حذف نهائي
                </button>
              )}
            </>
          )}
          <button onClick={onClose} className="btn-secondary text-sm">إغلاق</button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ onClose, wide, children }: { onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-gray-500 font-semibold">{label}</div>
      <div className="font-bold text-slate-800">{value || "—"}</div>
    </div>
  );
}
