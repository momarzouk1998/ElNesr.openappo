"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatQty } from "@/lib/format";
import { getCurrentUserClient } from "@/hooks/useCurrentUser";
import Pagination from "@/components/Pagination";
import CategoryCombobox from "@/components/CategoryCombobox";

interface Product {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  units_per_carton: number;
  last_purchase_price: number | null;
  default_sale_price: number;
  reorder_level: number;
  total_stock: number;
  inventory_items: { current_stock: number; store: { name: string } }[];
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();

  const apiUrl = `/api/products?search=${encodeURIComponent(debouncedSearch)}&category=${encodeURIComponent(category)}&limit=50&page=${page}`;

  const { data, loading, refetch } = useApi<{
    items: Product[];
    total: number;
    limit: number;
    page: number;
  }>(apiUrl);
  const { mutate } = useApiMutation();

  const categoryOptions = Array.from(
    new Set((data?.items ?? []).map((p) => p.category).filter(Boolean))
  ) as string[];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { getCurrentUserClient().then(setProfile); }, []);
  useEffect(() => {
    const pageParam = searchParams.get('page');
    if (pageParam) setPage(parseInt(pageParam));
  }, [searchParams]);

  const showCost = profile?.can_see_cost;

  async function deleteProduct(p: Product) {
    if (!confirm(`حذف الصنف "${p.name}"؟\nملاحظة: لو له فواتير تاريخية هيتم إخفاؤه فقط.`)) return;
    const { error } = await mutate('DELETE', `/api/products/${p.id}`);
    if (error) {
      alert('❌ ' + error);
      return;
    }
    alert('✅ تم حذف الصنف');
    refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-650">🏷️ الأصناف</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data?.total ?? 0} صنف إجمالي
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ إضافة صنف</button>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 ابحث بالاسم..."
          className="input-field md:flex-1"
          autoFocus
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-field md:w-56"
        >
          <option value="">كل الفئات</option>
          {categoryOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-gray-500">⏳ جاري التحميل...</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-100/90 text-slate-700 text-xs font-bold uppercase">
              <tr>
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-right">الفئة</th>
                <th className="p-3 text-right">الوحدة</th>
                <th className="p-3 text-right">إجمالي المخزون</th>
                <th className="p-3 text-right">الحد الأدنى</th>
                <th className="p-3 text-right">التوزيع بالمخازن</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((p) => {
                const isUnderLimit = Number(p.total_stock) <= Number(p.reorder_level);

                return (
                  <tr
                    key={p.id}
                    className={`border-t transition-colors ${
                      isUnderLimit ? 'bg-red-50/50 hover:bg-red-100/60' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="p-3 font-bold text-slate-900">{p.name}</td>
                    <td className="p-3 text-gray-600 text-xs">{p.category || '—'}</td>
                    <td className="p-3 text-xs">
                      <span className={`px-2 py-0.5 rounded font-semibold border ${
                        p.unit === 'carton' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        p.unit === 'box' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                        'bg-blue-100 text-blue-800 border-blue-200'
                      }`}>
                        {p.unit === 'piece' ? 'قطعة' : p.unit === 'box' ? 'علبة' : 'كرتونة'}
                      </span>
                      {p.unit !== 'piece' && (
                        <span className="text-[11px] text-gray-500 mr-1.5 font-mono">
                          ({p.units_per_carton} ق/كرتونة)
                        </span>
                      )}
                    </td>
                    <td className={`p-3 font-mono font-extrabold text-base ${
                      isUnderLimit ? 'text-red-600' : 'text-elnesr-600'
                    }`}>
                      {formatQty(p.total_stock)}
                    </td>
                    <td className="p-3 font-mono text-xs text-gray-500 font-bold">{p.reorder_level}</td>
                    <td className="p-3 text-xs text-gray-600">
                      {p.inventory_items.length > 0
                        ? p.inventory_items.map(i => `${i.store.name}: ${formatQty(i.current_stock)}`).join(' • ')
                        : '— لا يوجد رصيد في أي مخزن —'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => setEditProduct(p)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold"
                          title="تعديل بيانات الصنف"
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          onClick={() => deleteProduct(p)}
                          className="text-xs p-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                          title="حذف الصنف"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400">
                    لا توجد أصناف
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <Pagination
          total={data.total}
          page={data.page}
          pageSize={data.limit}
          baseUrl="/products"
        />
      )}

      {showForm && (
        <ProductFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refetch(); }}
        />
      )}

      {editProduct && (
        <ProductEditModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={() => { setEditProduct(null); refetch(); }}
        />
      )}
    </div>
  );
}

function ProductFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'piece',
    units_per_carton: 1,
    default_sale_price: 0,
    reorder_level: 5,
    last_purchase_price: 0,
    initial_stock: 0,
    store_id: '',
    notes: '',
  });
  const { data: storesData } = useApi<{ items: { id: string; name: string }[] }>('/api/stores');
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!form.name.trim()) { alert('❌ اسم المنتج مطلوب'); return; }
    if (form.last_purchase_price < 0) { alert('❌ سعر الشراء لا يمكن أن يكون سالباً'); return; }
    if (form.units_per_carton < 1) { alert('❌ سعة الكرتونة يجب أن تكون 1 على الأقل'); return; }
    const { error } = await mutate('POST', '/api/products', form);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">+ إضافة صنف جديد</h2>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">اسم الصنف *</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الفئة</label>
            <CategoryCombobox
              value={form.category}
              onChange={(val) => setForm({ ...form, category: val })}
              placeholder="اختر أو اكتب فئة..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الوحدة الأساسية</label>
            <select className="input-field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="piece">قطعة</option>
              <option value="box">علبة</option>
              <option value="carton">كرتونة</option>
            </select>
          </div>
          {form.unit !== 'piece' && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                عدد القطع في الكرتونة
                <span className="text-[11px] text-blue-600 font-normal mr-1 block">📦 عدد القطع داخل الكرتونة الواحدة (يُستخدم لتحويل العبوات في الشراء)</span>
              </label>
              <input
                type="number"
                min={1}
                className="input-field font-mono"
                value={form.units_per_carton}
                onChange={(e) => setForm({ ...form, units_per_carton: parseInt(e.target.value) || 1 })}
                placeholder="مثال: 12"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">سعر الشراء</label>
            <input type="number" step="0.01" min={0} className="input-field" value={form.last_purchase_price === 0 ? '' : form.last_purchase_price} onChange={(e) => setForm({ ...form, last_purchase_price: parseFloat(e.target.value) || 0 })} placeholder="0" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الحد الأدنى للتنبيه</label>
            <input type="number" min={0} className="input-field" value={form.reorder_level === 0 ? '' : form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: parseInt(e.target.value) || 0 })} placeholder="0" />
          </div>
        </div>

        {/* 📦 قسم رصيد أول المدة */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2">
          <label className="text-xs font-bold text-emerald-900 block">📦 رصيد أول المدة (الكمية الموجودة حالياً بالمخزن)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-emerald-800 block mb-0.5">الكمية الافتتاحية</label>
              <input
                type="number"
                min={0}
                step="any"
                className="input-field text-sm font-bold font-mono bg-white border-emerald-300"
                value={form.initial_stock}
                onChange={(e) => setForm({ ...form, initial_stock: Math.max(0, parseFloat(e.target.value) || 0) })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[11px] text-emerald-800 block mb-0.5">المخزن المودع به</label>
              <select
                className="input-field text-sm bg-white border-emerald-300"
                value={form.store_id}
                onChange={(e) => setForm({ ...form, store_id: e.target.value })}
              >
                <option value="">🏢 المخزن الرئيسي الافتراضي</option>
                {(storesData?.items || []).map(s => (
                  <option key={s.id} value={s.id}>🏢 {s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">ملاحظات</label>
          <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex gap-2 pt-3">
          <button onClick={save} disabled={loading || !form.name} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function ProductEditModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product.name,
    category: product.category || '',
    unit: product.unit,
    units_per_carton: product.units_per_carton,
    default_sale_price: Number(product.default_sale_price),
    reorder_level: product.reorder_level,
    last_purchase_price: Number(product.last_purchase_price || 0),
    notes: '',
  });
  const { mutate, loading } = useApiMutation();

  async function save() {
    if (!form.name.trim()) { alert('❌ اسم الصنف مطلوب'); return; }
    if (form.last_purchase_price < 0) { alert('❌ سعر الشراء لا يمكن أن يكون سالباً'); return; }
    if (form.units_per_carton < 1) { alert('❌ عدد القطع في الكرتونة يجب أن يكون 1 على الأقل'); return; }
    const { error } = await mutate('PATCH', `/api/products/${product.id}`, form);
    if (error) { alert('❌ ' + error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">✏️ تعديل صنف</h2>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">اسم الصنف *</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الفئة</label>
            <CategoryCombobox
              value={form.category}
              onChange={(val) => setForm({ ...form, category: val })}
              placeholder="اختر أو اكتب فئة..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الوحدة</label>
            <select className="input-field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="piece">قطعة</option>
              <option value="box">علبة</option>
              <option value="carton">كرتونة</option>
            </select>
          </div>
          {form.unit !== 'piece' && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                عدد القطع في الكرتونة
                <span className="text-[11px] text-blue-600 font-normal mr-1 block">📦 عدد القطع داخل الكرتونة الواحدة (يُستخدم لتحويل العبوات في الشراء)</span>
              </label>
              <input
                type="number"
                min={1}
                className="input-field font-mono"
                value={form.units_per_carton}
                onChange={(e) => setForm({ ...form, units_per_carton: parseInt(e.target.value) || 1 })}
                placeholder="مثال: 12"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">سعر الشراء</label>
            <input type="number" step="0.01" min={0} className="input-field" value={form.last_purchase_price === 0 ? '' : form.last_purchase_price} onChange={(e) => setForm({ ...form, last_purchase_price: parseFloat(e.target.value) || 0 })} placeholder="0" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">الحد الأدنى للتنبيه</label>
            <input type="number" min={0} className="input-field" value={form.reorder_level === 0 ? '' : form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: parseInt(e.target.value) || 0 })} placeholder="0" />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex justify-between items-center text-slate-700">
          <span>📦 رصيد المخزون الفعلي الحالي:</span>
          <span className="font-bold font-mono text-elnesr-600 text-sm">{formatQty(product.total_stock)} {product.unit === 'piece' ? 'قطعة' : product.unit === 'box' ? 'علبة' : 'كرتونة'}</span>
        </div>
        <div className="flex gap-2 pt-3">
          <button onClick={save} disabled={loading || !form.name.trim()} className="btn-primary flex-1">{loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
