"use client";
import { useState, useEffect } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatDate, statusColor, matchesArabicSearch } from "@/lib/format";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SearchableSelect, { type SearchOption } from "@/components/SearchableSelect";
import CustomerPaymentModal from "@/components/CustomerPaymentModal";
import { captureElementToCanvas } from "@/lib/html2canvas-safe";
import { getCurrentUserClient } from "@/hooks/useCurrentUser";
import Pagination from "@/components/Pagination";

// ─── Types ────────────────────────────────────────────────
interface Invoice {
  id: string; invoice_number: number; invoice_date: string;
  invoice_type: string; status: string; total: number;
  customer_id?: string | null;
  customer: { id?: string; name: string } | null; store: { name: string } | null;
  creator?: { full_name: string } | null;
  _count: { items: number }; subtotal?: number; discount?: number; paid_amount?: number;
}
interface CustomerReturn {
  id: string; return_number: number; return_date: string;
  status: string; total_amount: number; notes: string | null;
  customer: { id: string; name: string } | null;
  creator?: { full_name: string } | null;
  _count: { items: number };
}

// ─── Tab bar ──────────────────────────────────────────────
type Tab = "sales" | "returns";

export default function SalesPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "returns" ? "returns" : "sales");
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    getCurrentUserClient().then(p => {
      if (p?.role === "admin" || p?.role === "accountant" || p?.role === "manager") {
        setIsAdmin(true);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
        <TabBtn active={tab === "sales"} onClick={() => setTab("sales")} color="nazlawy">
          🛒 فواتير المبيعات
        </TabBtn>
        <TabBtn active={tab === "returns"} onClick={() => setTab("returns")} color="orange">
          ↩️ مرتجعات العملاء
        </TabBtn>
      </div>

      {tab === "sales"   && <SalesTab   isAdmin={isAdmin} />}
      {tab === "returns" && <CustomerReturnsTab isAdmin={isAdmin} />}
    </div>
  );
}

function TabBtn({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color: string; children: React.ReactNode;
}) {
  const activeClass = color === "orange"
    ? "border-orange-500 text-orange-600 bg-orange-50"
    : "border-nazlawy-500 text-nazlawy-600 bg-nazlawy-50";
  return (
    <button
      onClick={onClick}
      className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap flex-1 sm:flex-initial ${
        active ? activeClass : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1 — فواتير المبيعات
// ═══════════════════════════════════════════════════════════
function SalesTab({ isAdmin }: { isAdmin: boolean }) {
  const [customerId, setCustomerId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openInvoice, setOpenInvoice] = useState<Invoice | string | null>(null);
  const [openEditMode, setOpenEditMode] = useState<boolean>(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate } = useApiMutation();

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (customerId) params.set("customer_id", customerId);
  params.set("page", page.toString());
  const { data, loading, refetch } = useApi<{ items: Invoice[]; total: number; limit: number; page: number }>(
    `/api/sales/invoices?${params.toString()}&limit=50`
  );

  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) setPage(parseInt(pageParam));
  }, [searchParams]);

  // ✅ refetch فوري لما اليوزر يرجع لصفحة المبيعات (من الطباعة مثلاً)
  useEffect(() => {
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: customers } = useApi<{ items: { id: string; name: string; phone: string | null; balance: number }[] }>(
    "/api/customers?limit=200"
  );
  const customerOptions: SearchOption[] = (customers?.items || []).map(c => ({
    id: c.id, name: c.name, sub: c.phone || undefined,
    extra: `مديون: ${formatEGP(c.balance)} ج`,
  }));

  async function handleDeleteOrCancel(inv: Invoice) {
    const isCancelled = inv.status === "ملغاة";
    const msg = isCancelled
      ? `هل أنت متأكد من حذف الفاتورة رقم #${inv.invoice_number} نهائياً؟`
      : `هل أنت متأكد من إلغاء الفاتورة رقم #${inv.invoice_number} وإرجاع الأصناف للمخزن؟`;
    if (!confirm(msg)) return;
    
    const url = (isCancelled && isAdmin)
      ? `/api/sales/invoices/${inv.id}?permanent=true`
      : `/api/sales/invoices/${inv.id}`;
      
    const { error } = await mutate("DELETE", url);
    if (error) {
      alert("❌ " + error);
      return;
    }
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? "..."} فاتورة</p>
        <Link href="/sales/new" className="btn-primary">+ فاتورة جديدة</Link>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row md:flex-wrap">
        <div className="md:flex-1 md:min-w-[200px]">
          <SearchableSelect options={customerOptions} value={customerId} onChange={setCustomerId}
            placeholder="🔍 فلترة حسب العميل..." emptyLabel="كل العملاء" />
        </div>
        <select className="input-field text-sm md:w-40" value={type} onChange={e => setType(e.target.value)}>
          <option value="">كل الأنواع</option>
          <option value="عادية">عادية</option>
          <option value="ضريبية">ضريبية</option>
          <option value="عرض سعر">عرض سعر</option>
        </select>
        <select className="input-field text-sm md:w-40" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="مكتملة">مكتملة</option>
          <option value="قيد التنفيذ">قيد التنفيذ</option>
          <option value="ملغاة">ملغاة</option>
        </select>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {data?.items.map(inv => (
              <div key={inv.id} className="card p-3">
                <div onClick={() => { setOpenInvoice(inv); setOpenEditMode(false); }} className="cursor-pointer">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="font-mono font-bold text-nazlawy-600 text-lg">#{inv.invoice_number}</div>
                    <span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>{formatDate(inv.invoice_date)}</span><span>{inv.invoice_type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm truncate flex-1">{inv.customer?.name || "—"}</div>
                    <div className="font-bold text-nazlawy-600 text-base shrink-0 ml-2">{formatEGP(inv.total)} ج</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setOpenInvoice(inv); setOpenEditMode(false); }}
                    className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                  >
                    <span>👁️</span>
                    <span>عرض الفاتورة</span>
                  </button>
                  {inv.status !== 'مكتملة' && (
                    <button
                      onClick={() => { setOpenInvoice(inv); setOpenEditMode(true); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                    >
                      <span>✏️</span>
                      <span>تعديل</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteOrCancel(inv)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title={isAdmin ? "حذف الفاتورة" : "إلغاء الفاتورة"}
                  >
                    <span>🗑️</span>
                    <span>{inv.status === 'ملغاة' && isAdmin ? "حذف" : "إلغاء"}</span>
                  </button>
                </div>
              </div>
            ))}
            {data?.items.length === 0 && <div className="card text-center py-12 text-gray-400">لا توجد فواتير</div>}
          </div>

          {/* Desktop */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-right">رقم</th><th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">النوع</th><th className="p-3 text-right">العميل</th>
                  <th className="p-3 text-right">المخزن</th><th className="p-3 text-right">الأصناف</th>
                  <th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(inv => (
                  <tr key={inv.id} onClick={() => { setOpenInvoice(inv); setOpenEditMode(false); }} className="border-t hover:bg-nazlawy-50 cursor-pointer transition-colors">
                    <td className="p-3 font-mono font-bold text-nazlawy-600">#{inv.invoice_number}</td>
                    <td className="p-3 text-xs">{formatDate(inv.invoice_date)}</td>
                    <td className="p-3 text-xs">{inv.invoice_type}</td>
                    <td className="p-3 font-semibold text-slate-800">{inv.customer?.name || "—"}</td>
                    <td className="p-3 text-xs text-gray-500">{inv.store?.name || "—"}</td>
                    <td className="p-3 text-center">{inv._count.items}</td>
                    <td className="p-3 font-bold text-nazlawy-600">{formatEGP(inv.total)} ج</td>
                    <td className="p-3"><span className={`badge ${statusColor(inv.status)}`}>{inv.status}</span></td>
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2 items-center">
                        {inv.status !== 'مكتملة' && (
                          <button
                            onClick={() => { setOpenInvoice(inv); setOpenEditMode(true); }}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                            title="تعديل الفاتورة"
                          >
                            <span>✏️</span>
                            <span>تعديل</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteOrCancel(inv)}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                          title={isAdmin ? "حذف الفاتورة" : "إلغاء الفاتورة"}
                        >
                          <span>🗑️</span>
                          <span>{inv.status === 'ملغاة' && isAdmin ? "حذف" : "إلغاء"}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={9} className="p-12 text-center text-gray-400">لا توجد فواتير</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && data.total > 0 && (
        <Pagination
          total={data.total}
          page={data.page}
          pageSize={data.limit}
          baseUrl="/sales"
        />
      )}

      {openInvoice && (
        <InvoiceDetailsModal
          invoice={typeof openInvoice === 'object' ? openInvoice : null}
          invoiceId={typeof openInvoice === 'object' ? openInvoice.id : openInvoice}
          isAdmin={isAdmin}
          initialEditing={openEditMode}
          onClose={() => { setOpenInvoice(null); setOpenEditMode(false); }}
          onChanged={refetch}
        />
      )}

      {paymentInvoice && (
        <CustomerPaymentModal
          isOpen={!!paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          defaultCustomerId={paymentInvoice.customer_id || paymentInvoice.customer?.id}
          defaultCustomerName={paymentInvoice.customer?.name}
          defaultInvoiceId={paymentInvoice.id}
          onSuccess={() => {
            setPaymentInvoice(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2 — مرتجعات العملاء
// ═══════════════════════════════════════════════════════════
function CustomerReturnsTab({ isAdmin }: { isAdmin: boolean }) {
  const [customerId, setCustomerId] = useState("");
  const [openReturn, setOpenReturn] = useState<string | null>(null);

  const { data: customers } = useApi<{ items: { id: string; name: string; phone: string | null; balance: number }[] }>("/api/customers?limit=200");
  const qs = customerId ? `&customer_id=${customerId}` : "";
  const { data, loading, refetch } = useApi<{ items: CustomerReturn[]; total: number }>(`/api/returns/customer?limit=100${qs}`);
  const totalAmount = (data?.items || []).reduce((s, r) => s + Number(r.total_amount), 0);

  const customerOptions: SearchOption[] = (customers?.items || []).map(c => ({
    id: c.id, name: c.name, sub: c.phone || undefined,
    extra: `مديون: ${formatEGP(c.balance)} ج`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{data?.total ?? "..."} مرتجع • إجمالي: {formatEGP(totalAmount)} ج</p>
        <Link href="/returns/customer/new" className="btn-primary bg-orange-500 hover:bg-orange-600">+ مرتجع جديد</Link>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row md:flex-wrap">
        <div className="md:flex-1 md:min-w-[200px]">
          <SearchableSelect options={customerOptions} value={customerId} onChange={setCustomerId}
            placeholder="🔍 فلترة حسب العميل..." emptyLabel="كل العملاء" />
        </div>
      </div>

      {loading ? <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div> : (
        <>
          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {data?.items.map(ret => (
              <div key={ret.id} onClick={() => setOpenReturn(ret.id)}
                className="card p-3 cursor-pointer hover:border-orange-400 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="font-mono font-bold text-orange-600 text-lg">↩️ #{ret.return_number}</div>
                  <span className={`badge ${statusColor(ret.status)}`}>{ret.status}</span>
                </div>
                <div className="text-xs text-gray-500 mb-1.5">{formatDate(ret.return_date)}</div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm truncate flex-1">{ret.customer?.name || "—"}</div>
                  <div className="font-bold text-orange-600 text-base shrink-0 ml-2">{formatEGP(ret.total_amount)} ج</div>
                </div>
              </div>
            ))}
            {data?.items.length === 0 && <div className="card text-center py-12 text-gray-400">لا توجد مرتجعات</div>}
          </div>

          {/* Desktop */}
          <div className="card overflow-x-auto p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-orange-50">
                <tr>
                  <th className="p-3 text-right">رقم المرتجع</th><th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">العميل</th><th className="p-3 text-right">الأصناف</th>
                  <th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">المنشئ</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(ret => (
                  <tr key={ret.id} onClick={() => setOpenReturn(ret.id)}
                    className="border-t hover:bg-orange-50 cursor-pointer transition-colors">
                    <td className="p-3 font-mono font-bold text-orange-600">↩️ #{ret.return_number}</td>
                    <td className="p-3 text-xs">{formatDate(ret.return_date)}</td>
                    <td className="p-3 font-semibold">{ret.customer?.name || "—"}</td>
                    <td className="p-3 text-center">{ret._count.items}</td>
                    <td className="p-3 font-mono font-bold">{formatEGP(ret.total_amount)}</td>
                    <td className="p-3"><span className={`badge ${statusColor(ret.status)}`}>{ret.status}</span></td>
                    <td className="p-3 text-xs text-gray-500">{ret.creator?.full_name || "—"}</td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-gray-400">لا توجد مرتجعات عملاء</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openReturn && (
        <CustomerReturnDetailsModal returnId={openReturn} isAdmin={isAdmin}
          onClose={() => setOpenReturn(null)} onChanged={refetch} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL — تفاصيل مرتجع العميل
// ═══════════════════════════════════════════════════════════
function CustomerReturnDetailsModal({ returnId, isAdmin, onClose, onChanged }: {
  returnId: string; isAdmin: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data: ret, loading } = useApi<any>(`/api/returns/customer/${returnId}`);
  const { mutate } = useApiMutation();

  if (loading) return <ModalShell onClose={onClose}><p>⏳ جاري التحميل...</p></ModalShell>;
  if (!ret)    return <ModalShell onClose={onClose}><p>❌ لم يتم العثور على المرتجع</p></ModalShell>;

  const isCancelled = ret.status === "ملغاة";

  async function cancelReturn() {
    if (!confirm("هل تريد إلغاء هذا المرتجع؟\nسيتم خصم الكميات من المخزون وإعادة المبلغ لرصيد العميل.")) return;
    const { error } = await mutate("DELETE", `/api/returns/customer/${returnId}`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم إلغاء المرتجع"); onClose(); onChanged();
  }
  async function deleteReturn() {
    if (!confirm("⚠️ حذف نهائي — لا يمكن التراجع عنه. هل أنت متأكد؟")) return;
    const { error } = await mutate("DELETE", `/api/returns/customer/${returnId}?permanent=true`);
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم الحذف النهائي"); onClose(); onChanged();
  }

  return (
    <ModalShell onClose={onClose} wide>
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
        <div>
          <h2 className="text-lg font-bold">↩️ مرتجع عميل #{ret.return_number}
            <span className={`badge ${statusColor(ret.status)} mr-2`}>{ret.status}</span>
          </h2>
          <p className="text-xs text-gray-500">{formatDate(ret.return_date)}</p>
        </div>
        <button onClick={onClose} className="text-2xl text-gray-400 hover:text-red-500">✕</button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="العميل" value={ret.customer?.name} />
          <Info label="المنشئ" value={ret.creator?.full_name} />
          {ret.notes && <Info label="ملاحظات" value={ret.notes} />}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-orange-50">
            <tr>
              <th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th>
              <th className="p-2 text-left">سعر الوحدة</th><th className="p-2 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(ret.items || []).map((it: any) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.product_name}</td>
                <td className="p-2 text-center font-mono">{Number(it.quantity)}</td>
                <td className="p-2 font-mono">{formatEGP(Number(it.unit_price))}</td>
                <td className="p-2 font-mono font-bold">{formatEGP(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t pt-3 flex justify-between text-lg font-extrabold text-orange-700">
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
// MODAL — تفاصيل فاتورة المبيعات (RTX Document Style & Direct Download)
// ═══════════════════════════════════════════════════════════
function InvoiceDetailsModal({ invoice, invoiceId, isAdmin, initialEditing = false, onClose, onChanged }: {
  invoice?: Invoice | null; invoiceId: string; isAdmin: boolean; initialEditing?: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data: inv, loading, refetch } = useApi<any>("/api/sales/invoices/" + invoiceId);
  const { data: storesData } = useApi<{ items: { id: string; name: string }[] }>("/api/stores");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const { data: searchProductsData, loading: searchingProducts } = useApi<{ items: { id: string; name: string; default_sale_price: number; total_stock: number }[] }>(
    showProductPicker ? ("/api/products?search=" + encodeURIComponent(productSearch) + "&limit=100") : null
  );
  const { mutate, loading: saving } = useApiMutation();

  const [editing, setEditing] = useState(initialEditing);
  const [items, setItems] = useState<any[]>([]);
  const [discount, setDiscount] = useState(0);
  const [status, setStatus] = useState("");
  const [invoiceType, setInvoiceType] = useState("");
  const [notes, setNotes] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [downloadingImage, setDownloadingImage] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);

  useEffect(() => {
    if (inv && !editing) {
      setItems(inv.items || []);
      setDiscount(Number(inv.discount || 0));
      setStatus(inv.status);
      setInvoiceType(inv.invoice_type);
      setNotes(inv.notes || "");
    }
  }, [inv, editing]);

  const invData = inv || invoice;
  if (!invData) {
    return (
      <ModalShell onClose={onClose} wide>
        <div className="p-8 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-nazlawy-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح الفاتورة...</p>
        </div>
      </ModalShell>
    );
  }

  const isCompleted = invData.status === "مكتملة";
  const isCancelled = invData.status === "ملغاة";
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const total = Math.max(0, subtotal - discount);

  const displayItems = items.length > 0 ? items : (invData.items || []);
  const prevBalance = invData.customer && invData.customer_prev_balance !== null && invData.customer_prev_balance !== undefined
    ? Number(invData.customer_prev_balance)
    : null;
  const paidOnDate = Number(invData.paid_amount || 0);
  const currentInvoiceTotal = Number(invData.total || total || 0);
  const newBalance = prevBalance !== null
    ? (prevBalance + (isCancelled ? 0 : currentInvoiceTotal) - (isCancelled ? 0 : paidOnDate))
    : null;

  function addItem(p: any) {
    const store = storesData?.items.find(s => s.id === invData.store_id) || storesData?.items[0];
    setItems([...items, { product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.default_sale_price), store_id: invData.store_id || store?.id }]);
    setShowProductPicker(false); setProductSearch("");
  }
  function removeItem(idx: number) { setItems(items.filter((_: any, i: number) => i !== idx)); }
  function updateItem(idx: number, field: string, value: any) {
    setItems(items.map((it: any, i: number) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      if (field === "quantity") { const q = Number(value); next.quantity = Number.isFinite(q) && q > 0 ? q : 0; }
      if (field === "unit_price") { const v = Number(value); next.unit_price = Number.isFinite(v) && v >= 0 ? v : 0; }
      return next;
    }));
  }

  async function saveChanges() {
    const validItems = items.filter((i: any) => Number(i.quantity) > 0 && Number(i.unit_price) >= 0);
    if (validItems.length === 0) { alert("❌ لازم صنف واحد على الأقل"); return; }
    const { error } = await mutate("PATCH", "/api/sales/invoices/" + invoiceId, {
      items: validItems.map((i: any) => ({ product_id: i.product_id, store_id: i.store_id || invData.store_id, quantity: i.quantity, unit_price: i.unit_price })),
      discount,
      status: invoiceType === "عرض سعر" ? "قيد التنفيذ" : status,
      invoice_type: invoiceType,
      notes,
    });
    if (error) { alert("❌ " + error); return; }
    alert("✅ تم حفظ التعديلات"); setEditing(false); refetch(); onChanged();
  }

  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById("invoice-sheet-" + invoiceId);
    if (!element) return;
    try {
      setSharingWhatsapp(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });

      const customerPhone = invData.customer?.whatsapp || invData.customer?.phone;
      const cleanPhone = customerPhone ? String(customerPhone).replace(/\D/g, "") : "";
      const formattedPhone = cleanPhone.startsWith("0") ? ("2" + cleanPhone) : cleanPhone;
      const customerName = invData.customer?.name || "العميل المحترم";
      const invoiceText = "مرحباً بك أستاذ " + customerName + "،\nمرفق فاتورة شركة النسر رقم #" + invData.invoice_number + "\nالمبلغ المطلوب: " + formatEGP(currentInvoiceTotal) + " ج\nشكراً لتعاملكم معنا.";

      // 1. Native Image Share (Lets user pick ANY WhatsApp chat directly)
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob], `invoice_${invData.invoice_number}.png`, { type: "image/png" });
            if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "فاتورة شركة النسر #" + invData.invoice_number,
              });
              return;
            }

            // Direct share without canShare check
            await navigator.share({
              files: [file],
            });
            return;
          }
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") {
            return; // User cancelled
          }
          console.warn("Native share error, falling back to download:", shareErr);
        }
      }

      // 2. Fallback: Automatically download image & open WhatsApp app directly
      const link = document.createElement("a");
      link.download = `فاتورة_شركة_النسر_${invData.invoice_number}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      window.location.href = `whatsapp://send?text=${encodeURIComponent(invoiceText)}`;
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء إرسال الفاتورة عبر واتساب");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  const handleDirectDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById("invoice-sheet-" + invoiceId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });
      const link = document.createElement("a");
      link.download = "فاتورة شركة النسر - #" + invData.invoice_number + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تحميل الصورة");
    } finally {
      setDownloadingImage(false);
    }
  };

  const handleDirectDownloadPdf = async () => {
    if (downloadingPdf) return;
    const element = document.getElementById("invoice-sheet-" + invoiceId);
    if (!element) return;
    try {
      setDownloadingPdf(true);
      const { jsPDF } = await import("jspdf");
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const margin = 8;
      const printableWidth = pdfWidth - margin * 2;
      const imgWidth = printableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "JPEG", margin, margin, imgWidth, imgHeight);
      pdf.save("فاتورة شركة النسر - #" + invData.invoice_number + ".pdf");
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تحميل ملف PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const C = {
    navy: '#002b61',
    darkNavy: '#001a3a',
    orange: '#f7941d',
    darkOrange: '#d97706',
    border: '#cbd5e1',
    borderDark: '#94a3b8',
    tableHeader: '#002b61',
    rowAlt: '#f8fafc',
    green: '#15803d',
    red: '#dc2626',
    yellow: '#b45309',
    yellowBg: '#fef3c7',
    muted: '#64748b',
    text: '#1e293b',
    white: '#ffffff',
  };

  const filteredProducts = searchProductsData?.items || [];

  return (
    <ModalShell onClose={onClose} wide>
      {/* Print Styles Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #invoice-sheet-` + invoiceId + `, #invoice-sheet-` + invoiceId + ` * { visibility: visible !important; }
          #invoice-sheet-` + invoiceId + ` {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      ` }} />



      <div className="p-1 sm:p-3 md:p-4 space-y-3 max-h-[85vh] overflow-y-auto">
        {editing ? (
          /* وضع التعديل (Edit Mode) */
          <div className="space-y-4 pt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-base">تعديل بنود الفاتورة ({displayItems.length})</h3>
              {!isCompleted && !isCancelled && (
                <button onClick={() => setShowProductPicker(true)} className="text-xs btn-primary py-1.5 px-3 rounded-lg">+ صنف جديد</button>
              )}
            </div>
            <div className="space-y-2">
              {items.map((it: any, i: number) => (
                <div key={i} className="bg-slate-50 rounded-xl p-2.5 text-sm flex items-center gap-2 flex-wrap border border-slate-200">
                  <div className="font-bold flex-1 min-w-[150px] text-slate-800">{it.product_name}</div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">الكمية:</span>
                    <input type="number" min={0} step="any" value={it.quantity} onChange={e => updateItem(i, "quantity", parseFloat(e.target.value) || 0)} className="input-field text-xs p-1.5 w-20 text-center" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">السعر:</span>
                    <input type="number" min={0} step="any" value={it.unit_price === 0 ? '' : it.unit_price} onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} className="input-field text-xs p-1.5 w-24 text-center" />
                  </div>
                  <div className="text-xs font-mono font-bold w-24 text-left text-nazlawy-600">{formatEGP(Number(it.quantity) * Number(it.unit_price))} ج</div>
                  <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700 text-sm px-2">✕</button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="text-xs text-gray-600 font-bold block mb-1">نوع الفاتورة</label>
                <select className="input-field text-sm" value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
                  <option value="عادية">عادية</option><option value="ضريبية">ضريبية</option><option value="عرض سعر">عرض سعر</option>
                </select>
              </div>
              {invoiceType !== "عرض سعر" && (
                <div>
                  <label className="text-xs text-gray-600 font-bold block mb-1">الحالة</label>
                  <select className="input-field text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="قيد التنفيذ">قيد التنفيذ</option><option value="مكتملة">مكتملة</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-600 font-bold block mb-1">الخصم (ج.م)</label>
                <input type="number" min={0} step={0.01} className="input-field text-sm" value={discount === 0 ? '' : discount} onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} placeholder="0" />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs text-gray-600 font-bold block mb-1">ملاحظات</label>
                <textarea className="input-field text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
          /* العرض الرسمي المتطابق تماماً مع الفاتورة المطبوعة (Document View) */
          <div className="w-full overflow-x-auto pb-1">
            <div
              id={"invoice-sheet-" + invoiceId}
              className="printable-invoice-modal-content"
              style={{
                minWidth: '500px',
                width: '100%',
                margin: '0 auto',
                backgroundColor: C.white,
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                border: '1.5px solid ' + C.borderDark,
                direction: 'rtl',
                textAlign: 'right',
                color: C.text,
                fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
              }}
            >
              {/* Top Accent Line */}
              <div style={{ height: '6px', background: 'linear-gradient(90deg, ' + C.darkNavy + ' 0%, ' + C.navy + ' 60%, ' + C.orange + ' 100%)' }} />

              {/* Integrated Header */}
              <div
                style={{
                  padding: '0.9rem 1.1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '2px solid ' + C.border,
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      backgroundColor: C.white,
                      borderRadius: '10px',
                      padding: '3px',
                      border: '2px solid ' + C.orange,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src="/logo.png"
                      alt="شركة النسر"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: C.darkNavy, lineHeight: 1.15 }}>
                      شركة النسر
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: C.orange, marginTop: '2px' }}>
                      للأدوات واللوحات الكهربائية
                    </div>
                    <div style={{ fontSize: '0.74rem', color: C.muted, marginTop: '2px' }}>
                      تجارة وتوزيع الجملة
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      background: isCancelled ? C.red : C.darkNavy,
                      color: C.white,
                      padding: '3px 12px',
                      borderRadius: '20px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                    }}
                  >
                    {isCancelled ? 'فاتورة ملغاة 🚫' : ('فاتورة ' + invData.invoice_type)}
                  </div>
                  <div style={{ fontSize: '0.82rem', marginTop: '4px', color: C.text }}>
                    <span style={{ color: C.muted }}>رقم الفاتورة: </span>
                    <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: C.darkNavy }}>#{invData.invoice_number}</strong>
                  </div>
                  <div style={{ fontSize: '0.78rem', marginTop: '2px', color: C.muted }}>
                    <span>التاريخ: </span>
                    <strong style={{ color: C.text }}>{formatDate(invData.invoice_date)}</strong>
                  </div>
                </div>
              </div>

              {/* Customer & Warehouse Info Bar */}
              <div
                style={{
                  backgroundColor: '#f1f5f9',
                  borderBottom: '2px solid ' + C.border,
                  padding: '0.55rem 1.1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.88rem',
                }}
              >
                {invData.customer ? (
                  <div>
                    <span style={{ color: C.muted }}>العميل: </span>
                    <strong style={{ fontSize: '1rem', color: C.darkNavy, fontWeight: 900 }}>{invData.customer.name}</strong>
                    {invData.customer.phone && (
                      <span style={{ color: C.muted, marginRight: '10px', fontSize: '0.82rem' }}>📞 {invData.customer.phone}</span>
                    )}
                  </div>
                ) : (
                  <div>
                    <span style={{ color: C.muted }}>العميل: </span>
                    <strong style={{ fontSize: '0.95rem', color: C.darkNavy }}>عميل نقدي</strong>
                  </div>
                )}

                {invData.store && (
                  <div style={{ color: C.muted, fontSize: '0.82rem' }}>
                    <span>المخزن: </span>
                    <strong style={{ color: C.text }}>{invData.store.name}</strong>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: C.tableHeader, color: C.white, borderBottom: '2px solid ' + C.orange }}>
                    <th style={{ padding: '7px 8px', textAlign: 'center', width: '32px', fontSize: '0.8rem' }}>م</th>
                    <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: '0.85rem' }}>الصنف والبيان</th>
                    <th style={{ padding: '7px 8px', textAlign: 'center', width: '50px', fontSize: '0.8rem' }}>الكمية</th>
                    <th style={{ padding: '7px 8px', textAlign: 'left', width: '80px', fontSize: '0.8rem' }}>السعر</th>
                    <th style={{ padding: '7px 8px', textAlign: 'left', width: '95px', fontSize: '0.8rem' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((it: any, i: number) => (
                    <tr
                      key={it.id || i}
                      style={{
                        backgroundColor: i % 2 === 0 ? C.rowAlt : C.white,
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      <td style={{ padding: '7px 8px', textAlign: 'center', color: C.muted, fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 800, color: C.text, fontSize: '0.9rem' }}>{it.product_name}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: '0.95rem', color: C.darkNavy }}>
                        {Number(it.quantity)}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'left', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem' }}>
                        {formatEGP(Number(it.unit_price))}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'left', fontFamily: 'monospace', fontWeight: 900, fontSize: '0.95rem', color: C.navy }}>
                        {formatEGP(Number(it.line_total || (Number(it.quantity) * Number(it.unit_price))))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Financial Summary & Totals */}
              <div
                style={{
                  padding: '0.65rem 1.1rem',
                  borderTop: '2px solid ' + C.navy,
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '3px' }}>
                  <span style={{ color: C.muted, fontWeight: 600 }}>الإجمالي قبل الخصم:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {formatEGP(Number(invData.subtotal || subtotal))} ج
                  </span>
                </div>

                {Number(invData.discount || discount) > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.85rem',
                      color: C.yellow,
                      backgroundColor: C.yellowBg,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      marginBottom: '3px',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>الخصم:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.95rem' }}>
                      - {formatEGP(Number(invData.discount || discount))} ج
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '1.15rem',
                    fontWeight: 900,
                    borderTop: '2px dashed ' + C.border,
                    paddingTop: '6px',
                    color: C.darkNavy,
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap' }}>إجمالي الفاتورة:</span>
                  <span style={{ fontFamily: 'monospace', color: C.darkNavy, fontSize: '1.25rem', whiteSpace: 'nowrap' }}>
                    {formatEGP(Number(currentInvoiceTotal))} ج
                  </span>
                </div>
              </div>

              {/* Customer Statement Integrated Box */}
              {invData.customer && prevBalance !== null && newBalance !== null && (
                <div
                  style={{
                    margin: '0.4rem 1.1rem 0.75rem 1.1rem',
                    borderRadius: '10px',
                    border: '1.5px solid ' + (isCancelled ? '#fca5a5' : C.navy),
                    backgroundColor: isCancelled ? '#fff1f2' : '#f8fafc',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  {isCancelled && (
                    <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '3px 8px', fontSize: '0.75rem', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid #fca5a5' }}>
                      🚫 تنبيه: هذه الفاتورة ملغاة ولا تؤثر على كشف حساب العميل
                    </div>
                  )}
                  
                  <div
                    style={{
                      backgroundColor: C.darkNavy,
                      color: C.white,
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      textAlign: 'center',
                    }}
                  >
                    📑 كشف حساب العميل مدمج بالفاتورة
                  </div>

                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#edf2f7', color: C.text, fontWeight: 800, fontSize: '0.8rem' }}>
                        <th style={{ padding: '6px 3px', borderBottom: '1px solid ' + C.border }}>الحساب السابق</th>
                        {!isCancelled && <th style={{ padding: '6px 3px', borderBottom: '1px solid ' + C.border }}>+ الفاتورة الحالية</th>}
                        {!isCancelled && paidOnDate > 0 && <th style={{ padding: '6px 3px', borderBottom: '1px solid ' + C.border, color: C.green }}>- المدفوع</th>}
                        <th style={{ padding: '6px 3px', borderBottom: '1px solid ' + C.border, color: C.darkNavy, fontWeight: 900, backgroundColor: '#e2e8f0' }}>
                          {isCancelled ? 'رصيد العميل' : '= المتبقي النهائي'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.9rem' }}>
                        <td style={{ padding: '7px 3px', color: prevBalance > 0.01 ? C.red : prevBalance < -0.01 ? C.green : C.muted }}>
                          {formatEGP(prevBalance)} ج
                        </td>
                        {!isCancelled && (
                          <td style={{ padding: '7px 3px', color: C.darkOrange }}>
                            +{formatEGP(Number(currentInvoiceTotal))} ج
                          </td>
                        )}
                        {!isCancelled && paidOnDate > 0 && (
                          <td style={{ padding: '7px 3px', color: C.green }}>
                            -{formatEGP(paidOnDate)} ج
                          </td>
                        )}
                        <td style={{ padding: '7px 3px', color: newBalance > 0.01 ? C.red : newBalance < -0.01 ? C.green : C.darkNavy, backgroundColor: '#f1f5f9', fontSize: '1rem' }}>
                          {formatEGP(newBalance)} ج
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes */}
              {invData.notes && (
                <div style={{ margin: '0.4rem 1.1rem', padding: '6px 10px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '0.78rem', color: '#92400e' }}>
                  <strong>ملاحظات: </strong> {invData.notes}
                </div>
              )}

              {/* Elegant Footer */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  padding: '0.65rem 1.1rem',
                  borderTop: '1.5px solid ' + C.border,
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  color: '#475569',
                }}
              >
                <div style={{ fontWeight: 800, color: C.darkNavy, marginBottom: '1px' }}>
                  شركة النسر للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة
                </div>
                <div>شكراً لتعاملكم معنا ▪ للإدارة والاستفسارات يرجى التواصل عبر الواتساب أو الهاتف</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Actions Footer (no-print) */}
      <div className="p-3 bg-slate-100 border-t border-slate-200 no-print rounded-b-2xl">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!editing && (
            <>
              <button
                onClick={handleShareWhatsapp}
                disabled={sharingWhatsapp}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                title="إرسال واتساب"
              >
                <span>{sharingWhatsapp ? "⏳" : "📲"}</span>
                <span>{sharingWhatsapp ? "إرسال واتساب" : "واتساب"}</span>
              </button>

              <button
                onClick={handleDirectDownloadImage}
                disabled={downloadingImage}
                className="hidden sm:flex flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-bold px-4 py-2.5 rounded-xl items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                title="تحميل صورة"
              >
                <span>{downloadingImage ? "⏳" : "🖼️"}</span>
                <span>{downloadingImage ? "جاري..." : "صورة"}</span>
              </button>
            </>
          )}

          {editing && !isCancelled && !isCompleted && (
            <>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="col-span-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <span>{saving ? "⏳..." : "💾 حفظ التعديلات"}</span>
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setItems(invData.items || []);
                  setDiscount(Number(invData.discount || 0));
                  setStatus(invData.status);
                  setInvoiceType(invData.invoice_type);
                  setNotes(invData.notes || "");
                }}
                className="col-span-1 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs sm:text-sm font-bold px-3 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center"
              >
                إلغاء التعديل
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="col-span-1 sm:mr-auto bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center"
          >
            إغلاق
          </button>
        </div>
      </div>

      {showPaymentModal && (
        <CustomerPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          defaultCustomerId={invData.customer_id || undefined}
          defaultCustomerName={invData.customer?.name}
          defaultInvoiceId={invData.id}
          onSuccess={() => {
            setShowPaymentModal(false);
            refetch();
            onChanged();
          }}
        />
      )}

      {showProductPicker && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowProductPicker(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-3 border-b">
              <input autoFocus value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="🔍 ابحث عن صنف..." className="input-field" />
            </div>
            <div className="overflow-y-auto flex-1">
              {searchingProducts ? (
                <div className="p-8 text-center text-gray-500 font-bold">⏳ جاري البحث...</div>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((p: any) => (
                  <button key={p.id} onClick={() => addItem(p)} className="w-full text-right p-3 border-b hover:bg-gray-50 flex justify-between items-center transition-colors">
                    <div>
                      <div className="font-semibold text-sm text-gray-800">{p.name}</div>
                      <div className="text-xs text-gray-500">{formatEGP(p.default_sale_price)} ج</div>
                    </div>
                    <span className="text-xs font-bold text-nazlawy-600 bg-nazlawy-50 px-2 py-1 rounded">+ إضافة</span>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-gray-400 font-semibold">
                  {productSearch.trim() ? ("لا توجد نتائج لـ \"" + productSearch + "\"") : 'لا توجد أصناف'}
                </div>
              )}
            </div>
            <div className="p-3 border-t"><button onClick={() => setShowProductPicker(false)} className="btn-secondary w-full">إلغاء</button></div>
          </div>
        </div>
      )}
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
