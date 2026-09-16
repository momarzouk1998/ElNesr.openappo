"use client";
import { useState, useEffect } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate, statusColor } from "@/lib/format";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SearchableSelect, { type SearchOption } from "@/components/SearchableSelect";
import { getCurrentUserClient } from "@/hooks/useCurrentUser";

// ─── Types ────────────────────────────────────────────────
interface PurchaseInvoice {
  id: string; purchase_number: number; purchase_date: string;
  total_amount: number; paid_amount: number; status: string; notes: string | null;
  supplier?: { name: string } | null;
  creator?: { full_name: string } | null;
  _count?: { items: number };
}
interface SupplierReturn {
  id: string; return_number: number; return_date: string;
  status: string; total_amount: number; notes: string | null;
  supplier: { id: string; name: string } | null;
  creator?: { full_name: string } | null;
  _count: { items: number };
}

type Tab = "purchases" | "returns";

export default function PurchasesPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "returns" ? "returns" : "purchases");
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    getCurrentUserClient().then(p => { if (p?.role === "admin") setIsAdmin(true); });
  }, []);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
        <TabBtn active={tab === "purchases"} onClick={() => setTab("purchases")} color="purple">
          📥 فواتير المشتريات
        </TabBtn>
        <TabBtn active={tab === "returns"} onClick={() => setTab("returns")} color="violet">
          ↩️ مرتجعات الموردين
        </TabBtn>
      </div>

      {tab === "purchases" && <PurchasesTab isAdmin={isAdmin} />}
      {tab === "returns"   && <SupplierReturnsTab isAdmin={isAdmin} />}
    </div>
  );
}

function TabBtn({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color: string; children: React.ReactNode;
}) {
  const activeClass = color === "violet"
    ? "border-purple-500 text-purple-700 bg-purple-50"
    : "border-elnesr-500 text-elnesr-600 bg-elnesr-50";
  return (
    <button onClick={onClick}
      className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex-1 sm:flex-initial ${
        active ? activeClass : "border-transparent text-gray-500 hover:text-gray-700"
      }`}>
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1 — فواتير المشتريات
// ═══════════════════════════════════════════════════════════
function PurchasesTab({ isAdmin }: { isAdmin: boolean }) {
  const [supplierId, setSupplierId] = useState("");
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);

  const { data: suppliers } = useApi<{ items: { id: string; name: string; phone: string | null; balance: number }[] }>("/api/suppliers?limit=200");
  const qs = supplierId ? `?supplier_id=${supplierId}` : "";
  const { data, loading, refetch } = useApi<{ items: PurchaseInvoice[]; total: number }>(`/api/purchases/invoices${qs}`);
  const totalAmount = (data?.items || []).reduce((s, i) => s + Number(i.total_amount), 0);

  const supplierOptions: SearchOption[] = (suppliers?.items || []).map(s => ({
    id: s.id, name: s.name, sub: s.phone || undefined,
    extra: `مستحق: ${formatEGP(s.balance)} ج`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? "..."} فاتورة • إجمالي: {formatEGP(totalAmount)} ج</p>
        <Link href="/purchases/new" className="btn-primary">+ فاتورة شراء</Link>
      </div>
      <div className="card flex flex-col gap-3 md:flex-row md:flex-wrap">
        <div className="md:flex-1 md:min-w-[200px]">
          <SearchableSelect options={supplierOptions} value={supplierId} onChange={setSupplierId}
            placeholder="🔍 فلترة حسب المورد..." emptyLabel="كل الموردين" />
        </div>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {data?.items.map(inv => (
              <div key={inv.id} onClick={() => setOpenInvoice(inv.id)}
                className="card p-3 cursor-pointer hover:border-elnesr-500 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="font-mono font-bold text-purple-700 text-lg">#{inv.purchase_number}</div>
                  <span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span>
                </div>
                <div className="text-xs text-gray-500 mb-1.5">{formatDate(inv.purchase_date)}</div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm truncate flex-1">{inv.supplier?.name || "—"}</div>
                  <div className="font-bold text-elnesr-600 text-base shrink-0 ml-2">{formatEGP(inv.total_amount)} ج</div>
                </div>
              </div>
            ))}
            {data?.items.length === 0 && <div className="card text-center py-12 text-gray-400">لا توجد فواتير مشتريات</div>}
          </div>

          {/* Desktop */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-right">رقم</th><th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">المورد</th><th className="p-3 text-right">الأصناف</th>
                  <th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(inv => (
                  <tr key={inv.id} onClick={() => setOpenInvoice(inv.id)}
                    className="border-t hover:bg-elnesr-50 cursor-pointer transition-colors">
                    <td className="p-3 font-mono font-bold">#{inv.purchase_number}</td>
                    <td className="p-3 text-xs">{formatDate(inv.purchase_date)}</td>
                    <td className="p-3 font-semibold">{inv.supplier?.name || "—"}</td>
                    <td className="p-3 text-center">{inv._count?.items ?? 0}</td>
                    <td className="p-3 font-mono font-bold">{formatEGP(inv.total_amount)}</td>
                    <td className="p-3"><span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span></td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-gray-400">لا توجد فواتير</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openInvoice && (
        <PurchaseDetailsModal invoiceId={openInvoice} isAdmin={isAdmin}
          onClose={() => setOpenInvoice(null)} onChanged={refetch} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2 — مرتجعات الموردين
// ═══════════════════════════════════════════════════════════
function SupplierReturnsTab({ isAdmin }: { isAdmin: boolean }) {
  const [supplierId, setSupplierId] = useState("");
  const [openReturn, setOpenReturn] = useState<string | null>(null);

  const { data: suppliers } = useApi<{ items: { id: string; name: string; phone: string | null; balance: number }[] }>("/api/suppliers?limit=200");
  const qs = supplierId ? `&supplier_id=${supplierId}` : "";
  const { data, loading, refetch } = useApi<{ items: SupplierReturn[]; total: number }>(`/api/returns/supplier?limit=100${qs}`);
  const totalAmount = (data?.items || []).reduce((s, r) => s + Number(r.total_amount), 0);

  const supplierOptions: SearchOption[] = (suppliers?.items || []).map(s => ({
    id: s.id, name: s.name, sub: s.phone || undefined,
    extra: `مستحق: ${formatEGP(s.balance)} ج`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? "..."} مرتجع • إجمالي: {formatEGP(totalAmount)} ج</p>
        <Link href="/returns/supplier/new" className="btn-primary bg-purple-600 hover:bg-purple-700">+ مرتجع جديد</Link>
      </div>
      <div className="card flex flex-col gap-3 md:flex-row md:flex-wrap">
        <div className="md:flex-1 md:min-w-[200px]">
          <SearchableSelect options={supplierOptions} value={supplierId} onChange={setSupplierId}
            placeholder="🔍 فلترة حسب المورد..." emptyLabel="كل الموردين" />
        </div>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {data?.items.map(ret => (
              <div key={ret.id} onClick={() => setOpenReturn(ret.id)}
                className="card p-3 cursor-pointer hover:border-purple-400 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="font-mono font-bold text-purple-700 text-lg">↩️ #{ret.return_number}</div>
                  <span className={`badge ${statusColor(ret.status)}`}>{ret.status}</span>
                </div>
                <div className="text-xs text-gray-500 mb-1.5">{formatDate(ret.return_date)}</div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm truncate flex-1">{ret.supplier?.name || "—"}</div>
                  <div className="font-bold text-purple-600 text-base shrink-0 ml-2">{formatEGP(ret.total_amount)} ج</div>
                </div>
              </div>
            ))}
            {data?.items.length === 0 && <div className="card text-center py-12 text-gray-400">لا توجد مرتجعات موردين</div>}
          </div>

          {/* Desktop */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-purple-50">
                <tr>
                  <th className="p-3 text-right">رقم المرتجع</th><th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">المورد</th><th className="p-3 text-right">الأصناف</th>
                  <th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">المنشئ</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(ret => (
                  <tr key={ret.id} onClick={() => setOpenReturn(ret.id)}
                    className="border-t hover:bg-purple-50 cursor-pointer transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-700">↩️ #{ret.return_number}</td>
                    <td className="p-3 text-xs">{formatDate(ret.return_date)}</td>
                    <td className="p-3 font-semibold">{ret.supplier?.name || "—"}</td>
                    <td className="p-3 text-center">{ret._count.items}</td>
                    <td className="p-3 font-mono font-bold">{formatEGP(ret.total_amount)}</td>
                    <td className="p-3"><span className={`badge ${statusColor(ret.status)}`}>{ret.status}</span></td>
                    <td className="p-3 text-xs text-gray-500">{ret.creator?.full_name || "—"}</td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-gray-400">لا توجد مرتجعات موردين</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openReturn && (
        <SupplierReturnDetailsModal returnId={openReturn} isAdmin={isAdmin}
          onClose={() => setOpenReturn(null)} onChanged={refetch} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL — تفاصيل مرتجع المورد
// ═══════════════════════════════════════════════════════════
function SupplierReturnDetailsModal({ returnId, isAdmin, onClose, onChanged }: {
  returnId: string; isAdmin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data: ret, loading } = useApi<any>(`/api/returns/supplier/${returnId}`);
  const { mutate } = useApiMutation();

  if (loading) return <ModalShell onClose={onClose}><p className="p-8">⏳ جاري التحميل...</p></ModalShell>;
  if (!ret)    return <ModalShell onClose={onClose}><p className="p-8">❌ لم يتم العثور على المرتجع</p></ModalShell>;

  const isCancelled = ret.status === "ملغاة";

  async function cancelReturn() {
    if (!confirm("هل تريد إلغاء هذا المرتجع؟\nسيتم إعادة الكميات للمخزون وإرجاع المبلغ لرصيد المورد.")) return;
    const { error } = await mutate("DELETE", `/api/returns/supplier/${returnId}`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم إلغاء المرتجع"); onClose(); onChanged();
  }
  async function deleteReturn() {
    if (!confirm("⚠️ حذف نهائي — لا يمكن التراجع عنه. هل أنت متأكد؟")) return;
    const { error } = await mutate("DELETE", `/api/returns/supplier/${returnId}?permanent=true`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم الحذف النهائي"); onClose(); onChanged();
  }

  return (
    <ModalShell onClose={onClose} wide>
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
        <div>
          <h2 className="text-lg font-bold">↩️ مرتجع مورد #{ret.return_number}
            <span className={`badge ${statusColor(ret.status)} mr-2`}>{ret.status}</span>
          </h2>
          <p className="text-xs text-gray-500">{formatDate(ret.return_date)}</p>
        </div>
        <button onClick={onClose} className="text-2xl text-gray-400 hover:text-red-500">✕</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="المورد" value={ret.supplier?.name} />
          <Info label="المنشئ" value={ret.creator?.full_name} />
          {ret.notes && <Info label="ملاحظات" value={ret.notes} />}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-purple-50">
            <tr>
              <th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th>
              <th className="p-2 text-left">سعر الشراء</th><th className="p-2 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(ret.items || []).map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.product_name}</td>
                <td className="p-2 text-center font-mono">{Number(it.quantity)}</td>
                <td className="p-2 font-mono">{formatEGP(Number(it.unit_cost))}</td>
                <td className="p-2 font-mono font-bold">{formatEGP(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t pt-3 flex justify-between text-lg font-extrabold text-purple-700">
          <span>الإجمالي:</span><span className="font-mono">{formatEGP(Number(ret.total_amount))} ج</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-3 border-t">
          {!isCancelled && (
            <button onClick={cancelReturn} className="text-sm px-4 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">❌ إلغاء المرتجع</button>
          )}
          {isCancelled && <span className="text-sm text-red-700 font-bold self-center">🚫 ملغى</span>}
          {isAdmin && (
            <button onClick={deleteReturn} className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black ml-auto">🗑️ حذف نهائي</button>
          )}
          <button onClick={onClose} className="btn-secondary text-sm">إغلاق</button>
        </div>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL — تفاصيل فاتورة الشراء
// ═══════════════════════════════════════════════════════════
function PurchaseDetailsModal({ invoiceId, isAdmin, onClose, onChanged }: {
  invoiceId: string; isAdmin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data: inv, loading, refetch } = useApi<any>(`/api/purchases/invoices/${invoiceId}`);
  const { mutate } = useApiMutation();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [notes, setNotes]   = useState("");

  const isCompleted = inv?.status === "مكتملة";
  const isCancelled = inv?.status === "ملغاة";

  if (inv && status === "") { setStatus(inv.status); setNotes(inv.notes || ""); }

  if (loading) return <ModalShell onClose={onClose}><p className="p-8">⏳ جاري التحميل...</p></ModalShell>;
  if (!inv)    return <ModalShell onClose={onClose}><p className="p-8">❌ لم يتم العثور على الفاتورة</p></ModalShell>;

  async function saveChanges() {
    const { error } = await mutate("PATCH", `/api/purchases/invoices/${invoiceId}`, { status, notes });
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم حفظ التعديلات"); setEditing(false); refetch();
  }
  async function cancelInvoice() {
    if (!confirm("هل تريد إلغاء هذه الفاتورة؟")) return;
    const { error } = await mutate("DELETE", `/api/purchases/invoices/${invoiceId}`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم إلغاء الفاتورة"); onClose(); onChanged();
  }
  async function deleteInvoice() {
    if (!confirm("⚠️ حذف نهائي — لا يمكن التراجع عنه. هل أنت متأكد؟")) return;
    if (!confirm("⚠️ تأكيد أخير؟")) return;
    const { error } = await mutate("DELETE", `/api/purchases/invoices/${invoiceId}?permanent=true`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم الحذف النهائي"); onClose(); onChanged();
  }

  return (
    <ModalShell onClose={onClose} wide>
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
        <div>
          <h2 className="text-lg font-bold">📥 فاتورة مشتريات #{inv.purchase_number}
            <span className={`badge ${statusColor(inv.status)} mr-2`}>{inv.status}</span>
          </h2>
          <p className="text-xs text-gray-500">{formatDate(inv.purchase_date)}</p>
        </div>
        <button onClick={onClose} className="text-2xl text-gray-400 hover:text-red-500">✕</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Info label="المورد" value={inv.supplier?.name || "—"} />
          <Info label="المنشئ" value={inv.creator?.full_name || "—"} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th>
              <th className="p-2 text-left">سعر الشراء</th><th className="p-2 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.product_name}</td>
                <td className="p-2 text-center font-mono">{Number(it.quantity)}</td>
                <td className="p-2 text-left font-mono">{formatEGP(Number(it.unit_cost))}</td>
                <td className="p-2 text-left font-mono font-bold">{formatEGP(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between text-lg font-extrabold border-t pt-2 text-elnesr-600">
          <span>الإجمالي:</span><span className="font-mono">{formatEGP(Number(inv.total_amount))} ج</span>
        </div>
        {inv.notes && <div className="text-xs text-gray-600 border-t pt-2">📝 {inv.notes}</div>}

        {editing && !isCompleted && !isCancelled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">الحالة</label>
              <select className="input-field text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="قيد التنفيذ">قيد التنفيذ</option>
                <option value="مكتملة">مكتملة</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 block mb-1">ملاحظات</label>
              <textarea className="input-field text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
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
              {!isCompleted && !isCancelled && <button onClick={() => setEditing(true)} className="btn-secondary text-sm">✏️ تعديل</button>}
              {!isCancelled && (
                <button onClick={cancelInvoice} className={`text-sm px-4 py-2 rounded-lg font-semibold border transition ${isAdmin ? "bg-red-600 text-white hover:bg-red-700 border-red-700" : "bg-red-50 text-red-700 hover:bg-red-100 border-red-200"}`}>
                  {isAdmin ? "⚠️ إلغاء (مدير)" : "🗑️ إلغاء الفاتورة"}
                </button>
              )}
              {isAdmin && (
                <button onClick={deleteInvoice} className="text-sm px-4 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800">🗑️💀 حذف نهائي</button>
              )}
            </>
          )}
          <button onClick={onClose} className="btn-secondary text-sm">إغلاق</button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Shared helpers ───────────────────────────────────────
function ModalShell({ onClose, wide, children }: { onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold">{value || "—"}</div>
    </div>
  );
}
