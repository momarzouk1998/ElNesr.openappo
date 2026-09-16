"use client";
import { useState, useEffect } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatQty } from "@/lib/format";
import { useRouter } from "next/navigation";
import SearchableSelect, { type SearchOption } from "@/components/SearchableSelect";

interface Product { id: string; name: string; unit: string; last_purchase_price: number; total_stock: number; }
interface Supplier { id: string; name: string; balance: number; phone?: string | null; }
interface Store { id: string; name: string; type: string; }
interface CartItem { product_id: string; product_name: string; store_id: string; store_name: string; quantity: number; unit_cost: number; }

export default function NewPurchasePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [primaryStoreId, setPrimaryStoreId] = useState("");
  const [status, setStatus] = useState("قيد التنفيذ");
  const [notes, setNotes] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const { mutate, loading: saving } = useApiMutation();
  const { data: productsData } = useApi<{ items: Product[] }>(`/api/products?search=${encodeURIComponent(search)}&limit=30`);
  const { data: suppliersData } = useApi<{ items: Supplier[] }>('/api/suppliers?limit=200');
  const { data: storesData } = useApi<{ items: Store[] }>('/api/stores');

  const stores = storesData?.items;

  useEffect(() => {
    if (stores && stores.length > 0 && !primaryStoreId) {
      setPrimaryStoreId(stores[0].id);
    }
  }, [stores, primaryStoreId]);

  const defaultStoreId = primaryStoreId || (stores && stores.length > 0 ? stores[0].id : '');

  const total = cart.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  function addToCart(p: Product) {
    if (!defaultStoreId) { alert('❌ لا يوجد مخازن معرفة في النظام'); return; }
    const chosenStore = stores?.find(s => s.id === defaultStoreId);
    const existing = cart.find(c => c.product_id === p.id && c.store_id === defaultStoreId);
    if (existing) {
      setCart(cart.map(c => (c.product_id === p.id && c.store_id === defaultStoreId) ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, {
        product_id: p.id,
        product_name: p.name,
        store_id: defaultStoreId,
        store_name: chosenStore?.name || '',
        quantity: 1,
        unit_cost: p.last_purchase_price && Number(p.last_purchase_price) > 0 ? Number(p.last_purchase_price) : 0,
      }]);
    }
  }

  function updateItem(idx: number, field: keyof CartItem, value: any) {
    setCart(cart.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, [field]: value };
      if (field === 'quantity') {
        const q = Number(value);
        next.quantity = Number.isFinite(q) && q >= 0 ? q : 0;
      }
      if (field === 'unit_cost') {
        const v = Number(value);
        next.unit_cost = Number.isFinite(v) && v >= 0 ? v : 0;
      }
      return next;
    }));
  }

  function adjustQty(idx: number, delta: number) {
    setCart(cart.map((c, i) => {
      if (i !== idx) return c;
      return { ...c, quantity: Math.max(0, c.quantity + delta) };
    }));
  }

  function removeItem(idx: number) {
    setCart(cart.filter((_, i) => i !== idx));
  }

  async function save() {
    if (cart.length === 0) { alert('السلة فارغة'); return; }
    const validItems = cart.filter(c => c.quantity > 0 && c.unit_cost >= 0 && c.store_id);
    const invalid = cart.length - validItems.length;
    if (invalid > 0) {
      if (!confirm(`يوجد ${invalid} صنف بكمية أو سعر صفر وسيتم استبعاده. متابعة؟`)) return;
    }
    if (validItems.length === 0) { alert('❌ كل الأصناف لها كمية أو سعر غير صالح'); return; }
    if (!supplierId) {
      if (!confirm('لم تختر موردًا. هل تريد المتابعة؟')) return;
    }
    const validTotal = validItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
    const { error, data } = await mutate<{ id: string; purchase_number: number }>('POST', '/api/purchases/invoices', {
      supplier_id: supplierId || null,
      status,
      total_amount: validTotal,
      notes,
      items: validItems.map(c => ({ product_id: c.product_id, store_id: c.store_id, quantity: c.quantity, unit_cost: c.unit_cost })),
    });
    if (error) { alert('❌ ' + error); return; }
    alert(`✅ تم حفظ فاتورة الشراء رقم ${data?.purchase_number}`);
    router.push('/purchases');
  }

  const supplierOptions: SearchOption[] = (suppliersData?.items || []).map(s => ({
    id: s.id,
    name: s.name,
    sub: s.phone || undefined,
    extra: `مستحق: ${formatEGP(s.balance)} ج`,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Products panel */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-extrabold text-slate-650">📥 إنشاء فاتورة مشتريات</h1>
          <button onClick={() => router.push('/purchases')} className="btn-secondary text-sm">↩️ رجوع</button>
        </div>
        <div className="card">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 ابحث عن صنف بالاسم..."
            className="input-field"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[600px] overflow-y-auto">
          {productsData?.items.map(p => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="card text-right hover:border-elnesr-500 hover:shadow-lg transition-all p-3"
            >
              <div className="font-semibold text-sm line-clamp-2">{p.name}</div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-elnesr-600 font-bold">آخر سعر: {formatEGP(p.last_purchase_price)} ج</span>
                <span className="font-mono text-gray-600">متاح: {formatQty(p.total_stock)}</span>
              </div>
            </button>
          ))}
          {search.trim() !== "" && productsData?.items.length === 0 && (
            <div className="col-span-full card p-4 text-center">
              <p className="text-gray-500 mb-2">لا توجد نتائج لـ "{search}"</p>
              <button
                type="button"
                onClick={() => setShowNewProduct(true)}
                className="btn-primary text-sm"
              >+ إضافة صنف جديد بهذا الاسم</button>
            </div>
          )}
          {search.trim() === "" && productsData?.items.length === 0 && (
            <div className="card text-center text-gray-400 py-12 col-span-full">ابدأ بكتابة اسم الصنف للبحث</div>
          )}
        </div>
      </div>

      {/* Cart panel */}
      <div className="space-y-3">
        <div className="card space-y-2">
          <h2 className="font-bold text-lg">🛍️ السلة ({cart.length})</h2>
          <div>
            <label className="text-xs text-gray-600 block mb-1">المورد</label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="🔍 ابحث عن مورد بالاسم أو الهاتف..."
              emptyLabel="— بدون مورد —"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">المخزن الافتراضي للاستلام</label>
            <select
              className="input-field text-sm"
              value={primaryStoreId}
              onChange={(e) => {
                const newId = e.target.value;
                setPrimaryStoreId(newId);
                const targetStore = stores?.find(s => s.id === newId);
                if (targetStore && cart.length > 0) {
                  setCart(cart.map(item => ({ ...item, store_id: newId, store_name: targetStore.name })));
                }
              }}
            >
              {stores?.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">الحالة</label>
            <select className="input-field text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="قيد التنفيذ">قيد التنفيذ (مسودة - لا تخصم المخزون)</option>
              <option value="مكتملة">مكتملة (نهائية - تضيف للمخزون)</option>
            </select>
          </div>
        </div>

        <div className="card max-h-[300px] overflow-y-auto p-2">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">السلة فارغة</div>
          ) : (
            <div className="space-y-2">
              {cart.map((c, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-2 text-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-semibold flex-1 line-clamp-2">{c.product_name}</div>
                    <button onClick={() => removeItem(i)} className="text-red-500 text-xs shrink-0">✕ حذف</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">الكمية</label>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => adjustQty(i, -1)} className="w-6 h-7 shrink-0 rounded bg-gray-200 text-gray-700 font-bold hover:bg-gray-300">−</button>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="input-field text-xs p-1 text-center w-full"
                          value={c.quantity}
                          onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                        <button type="button" onClick={() => adjustQty(i, 1)} className="w-6 h-7 shrink-0 rounded bg-gray-200 text-gray-700 font-bold hover:bg-gray-300">+</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">سعر الشراء (ج)</label>
                      <input type="number" min={0} step="any" className="input-field text-xs p-1" value={c.unit_cost === 0 ? '' : c.unit_cost} onChange={(e) => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">الإجمالي</label>
                      <div className="text-xs font-bold text-elnesr-600 text-center p-1 bg-white rounded border">{formatEGP(c.quantity * c.unit_cost)}</div>
                    </div>
                  </div>
                  <div className="mt-1">
                    <label className="text-[10px] text-gray-500 block mb-0.5">مخزن الاستلام</label>
                    <select
                      className="input-field text-[11px] p-1"
                      value={c.store_id}
                      onChange={(e) => {
                        const newStoreId = e.target.value;
                        const newStore = stores?.find(s => s.id === newStoreId);
                        setCart(cart.map((row, idx) => idx === i ? { ...row, store_id: newStoreId, store_name: newStore?.name || '' } : row));
                      }}
                    >
                      {stores?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card space-y-2">
          <div className="flex justify-between text-lg font-extrabold border-t pt-2">
            <span>الإجمالي:</span><span className="text-elnesr-600">{formatEGP(total)} ج</span>
          </div>
          <textarea className="input-field text-xs" rows={2} placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button onClick={save} disabled={saving || cart.length === 0} className="btn-primary w-full">
            {saving ? '⏳ جاري الحفظ...' : 'حفظ الفاتورة'}
          </button>
        </div>
      </div>

      {showNewProduct && (
        <NewProductModal
          initialName={search}
          onClose={() => setShowNewProduct(false)}
          onAdded={(p) => { addToCart(p); setShowNewProduct(false); }}
        />
      )}
    </div>
  );
}

function NewProductModal({ initialName, onClose, onAdded }: { initialName: string; onClose: () => void; onAdded: (p: Product) => void }) {
  const [f, setF] = useState({
    name: initialName,
    default_sale_price: 0,
    last_purchase_price: 0,
    category: "",
    unit: "piece",
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!f.name.trim()) { alert('❌ اسم الصنف مطلوب'); return; }
    if (f.last_purchase_price < 0) { alert('❌ سعر الشراء يجب أن يكون موجباً'); return; }
    const { error, data } = await mutate<Product>('POST', '/api/products', f);
    if (error) { alert('❌ ' + error); return; }
    onAdded(data!);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-bold">+ إضافة صنف جديد</h2>
        <div>
          <label className="text-sm font-medium block mb-1">الاسم *</label>
          <input className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">سعر الشراء</label>
            <input type="number" step="0.01" min={0} className="input-field" value={f.last_purchase_price === 0 ? '' : f.last_purchase_price} onChange={(e) => setF({ ...f, last_purchase_price: parseFloat(e.target.value) || 0 })} placeholder="0" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">الفئة</label>
            <input className="input-field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="مثال: إضاءة، أسلاك..." />
          </div>
        </div>
        <p className="text-xs text-gray-500">💡 بعد الإضافة ستتم إضافته تلقائياً للفاتورة. يمكن تعديل التفاصيل لاحقاً من صفحة الأصناف.</p>
        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ وإضافة للفاتورة'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
