"use client";
import { useState, useEffect } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { formatEGP, formatQty } from "@/lib/format";
import { useRouter } from "next/navigation";
import SearchableSelect, { type SearchOption } from "@/components/SearchableSelect";
import CustomerPaymentModal from "@/components/CustomerPaymentModal";

interface Product {
  id: string; name: string; unit: string; default_sale_price: number; total_stock: number;
  category?: string | null;
  inventory_items?: { current_stock: number; store_id: string }[];
}
interface Customer { id: string; name: string; balance: number; phone?: string | null; }
interface Store { id: string; name: string; type: string; }
// ✅ نخزن الكمية والسعر كـ string في الـ cart عشان نسمع كل keystroke لحظياً
//    ونعمل parse فقط للحسابات (subtotal/total). هذا يمنع مشكلة "بيكتب 2 فيطلع 0"
interface CartItem {
  product_id: string;
  product_name: string;
  store_id: string;
  store_name: string;
  quantity: string;       // ← string (لحظي)
  unit_price: string;     // ← string (لحظي)
  available: number;
  product_ref: Product;
}

export default function POSPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [primaryStoreId, setPrimaryStoreId] = useState("");
  const [invoiceType, setInvoiceType] = useState("عادية");
  const [status, setStatus] = useState("مكتملة");
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("نقدي");
  const [treasuryId, setTreasuryId] = useState("");
  const [notes, setNotes] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [smartSplitItem, setSmartSplitItem] = useState<{ product: Product, requestedQty: number, currentStoreId: string, itemIdx?: number } | null>(null);
  const { mutate, loading: saving } = useApiMutation();
  const { data: productsData, loading: loadingProducts } = useApi<{ items: Product[] }>(`/api/products?search=${encodeURIComponent(search)}&limit=100`);
  const { data: customers } = useApi<{ items: Customer[] }>('/api/customers?limit=5000');
  const { data: stores } = useApi<{ items: Store[] }>('/api/stores');
  const { data: treasuriesData } = useApi<{ items: { id: string; name: string; current_balance: number }[] }>('/api/treasury');

  useEffect(() => {
    if (treasuriesData?.items && treasuriesData.items.length > 0 && !treasuryId) {
      setTreasuryId(treasuriesData.items[0].id);
    }
  }, [treasuriesData, treasuryId]);

  useEffect(() => {
    if (stores?.items && stores.items.length > 0 && !primaryStoreId) {
      setPrimaryStoreId(stores.items[0].id);
    }
  }, [stores, primaryStoreId]);

  const subtotal = cart.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);
  const total = Math.max(0, subtotal - discount);
  const selectedCustomer = customers?.items.find(c => c.id === customerId);

  // المخزون المتاح للصنف في المخزن المختار
  function stockFor(p: Product, sId: string): number {
    if (!sId) return 0;
    const perStore = p.inventory_items?.find(i => i.store_id === sId);
    return perStore ? Number(perStore.current_stock) : 0;
  }

  // الكسر المخزني للصنف: قائمة المخازن + الكمية المتاحة، مرتبة بالمتاح الأكبر
  function storeBreakdown(p: Product) {
    const all = (stores?.items || []).map(s => ({
      id: s.id,
      name: s.name,
      available: stockFor(p, s.id),
    })).filter(s => s.available > 0)
      .sort((a, b) => b.available - a.available);
    return all;
  }

  function addToCart(p: Product) {
    if (!stores?.items?.length) {
      alert('� لا يوجد مخازن معرفة في السيستم');
      return;
    }

    // المخزن المستهدف: المخزن المختار بالرئيسي، أو أول مخزن
    const chosenStoreId = primaryStoreId || stores.items[0].id;
    const targetStore = stores.items.find(s => s.id === chosenStoreId) || stores.items[0];
    const available = stockFor(p, targetStore.id);
    const existing = cart.find(c => c.product_id === p.id && c.store_id === targetStore.id);

    if (existing) {
      // ✅ functional updater يضمن قراءة آخر قيمة (حتى لو المستخدم ضغط بسرعة)
      setCart(prev => prev.map(c => {
        if (c.product_id === p.id && c.store_id === targetStore.id) {
          const currentQty = parseFloat(c.quantity) || 0;
          return { ...c, quantity: String(currentQty + 1) };
        }
        return c;
      }));
    } else {
      setCart([...cart, {
        product_id: p.id,
        product_name: p.name,
        store_id: targetStore.id,
        store_name: targetStore.name,
        quantity: '1',
        unit_price: p.default_sale_price && Number(p.default_sale_price) > 0 ? String(p.default_sale_price) : '',
        available,
        product_ref: p
      }]);
    }
  }

  function updateItem(idx: number, field: keyof CartItem, value: any) {
    // ✅ نخلي الـ quantity/unit_price كـ string في الـ state
    //    عشان المستخدم لو كتب "2.5" ما يطلعش 0 في النص
    //    (لو حوّلنا لـ number، parseFloat("") = NaN → 0)
    setCart(prev => {
      let shouldOpenSplit = false;
      let splitParams: any = null;
      const newCart = prev.map((c, i) => {
        if (i !== idx) return c;
        let next = { ...c, [field]: value };

        if (field === 'quantity') {
          // ✅ string → number فقط للفحص، نخلي string في الـ state
          const qStr = String(value);
          const q = parseFloat(qStr);

          // خانة فاضية أو نص غير صالح = خلّيها فاضية (مش 0)
          if (qStr === '' || qStr === '.' || qStr === '-') {
            next.quantity = qStr;
            return next;
          }
          if (!Number.isFinite(q) || q < 0) {
            next.quantity = '0';
            return next;
          }
          if (q === 0) {
            next.quantity = '0';
            return next;
          }
          if (q > c.available) {
            if (c.product_ref.total_stock >= q) {
              shouldOpenSplit = true;
              splitParams = { product: c.product_ref, requestedQty: q, currentStoreId: c.store_id, itemIdx: i };
              // نخلي الكمية زي ما هي لحد ما الـ modal يتعمل
              next.quantity = qStr;
              return next;
            } else {
              alert(`⚠️ الكمية المطلوبة تتجاوز إجمالي المخزون المتاح في جميع المخازن (${c.product_ref.total_stock})`);
              next.quantity = String(c.available);
              return next;
            }
          }
          // ✅ خلي string كما هو (مثلاً "2" أو "2.5")
          next.quantity = qStr;
        }

        if (field === 'unit_price') {
          const vStr = String(value);
          const v = parseFloat(vStr);
          // نفس المنطق: فاضي = فاضي، مش 0
          if (vStr === '' || vStr === '.' || vStr === '-') {
            next.unit_price = vStr;
            return next;
          }
          if (!Number.isFinite(v) || v < 0) {
            next.unit_price = '0';
            return next;
          }
          next.unit_price = vStr;
        }
        return next;
      });
      // ✅ حفظ splitParams في state خارج الـ updater بعد ما الـ setCart يخلص
      if (shouldOpenSplit && splitParams) {
        setTimeout(() => setSmartSplitItem(splitParams), 0);
      }
      return newCart;
    });
  }

  function adjustQty(idx: number, delta: number) {
    // ✅ functional updater يضمن قراءة آخر قيمة (حتى لو ضغط + بسرعة)
    setCart(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const currentQty = parseFloat(c.quantity) || 0;
      const newQty = Math.max(0, currentQty + delta);
      return { ...c, quantity: String(newQty) };
    }));
  }

  function removeItem(idx: number) {
    setCart(cart.filter((_, i) => i !== idx));
  }
  
  function handleSmartSplitConfirm(splits: { store_id: string, store_name: string, quantity: number }[]) {
    if (!smartSplitItem) return;
    const { product, itemIdx } = smartSplitItem;
    
    // إزالة العنصر القديم إذا كنا نعدل
    let newCart = [...cart];
    if (itemIdx !== undefined) {
      newCart = newCart.filter(c => c.product_id !== product.id);
    } else {
      newCart = newCart.filter(c => c.product_id !== product.id);
    }
    
    // إضافة الأسطر الجديدة
    splits.forEach(split => {
      if (split.quantity > 0) {
        newCart.push({
          product_id: product.id,
          product_name: product.name,
          store_id: split.store_id,
          store_name: split.store_name,
          quantity: String(split.quantity),
          unit_price: String(Number(product.default_sale_price)),
          available: stockFor(product, split.store_id),
          product_ref: product
        });
      }
    });
    
    setCart(newCart);
    setSmartSplitItem(null);
  }

  async function save() {
    if (cart.length === 0) { alert('السلة فارغة'); return; }
    // ✅ parse الـ strings لـ numbers عند الحفظ فقط
    const validItems = cart.filter(c => {
      const q = parseFloat(c.quantity);
      const p = parseFloat(c.unit_price);
      return Number.isFinite(q) && q > 0 && Number.isFinite(p) && p >= 0;
    });
    const invalid = cart.length - validItems.length;
    if (invalid > 0) {
      if (!confirm(`يوجد ${invalid} صنف بكمية أو سعر صفر وسيتم استبعاده. متابعة؟`)) return;
    }
    if (validItems.length === 0) { alert('❌ كل الأصناف لها كمية أو سعر غير صالح'); return; }
    if (status !== 'قيد التنفيذ' && invoiceType !== 'عرض سعر' && !customerId) {
      if (!confirm('لم تختر عميل. هل تريد المتابعة؟')) return;
    }

    const finalStatus = invoiceType === 'عرض سعر' ? 'قيد التنفيذ' : status;
    const storeIdToSave = primaryStoreId || validItems[0]?.store_id || null;

    // ✅ parse الكمية والسعر لـ number قبل الإرسال للسيرفر
    const validItemsForApi = validItems.map(c => ({
      product_id: c.product_id,
      store_id: c.store_id,
      quantity: parseFloat(c.quantity),
      unit_price: parseFloat(c.unit_price),
    }));
    const subtotalCalc = validItemsForApi.reduce((s, i) => s + i.quantity * i.unit_price, 0);

    const { error, data } = await mutate<{ id: string; invoice_number: number }>('POST', '/api/sales/invoices', {
      customer_id: customerId || null,
      store_id: storeIdToSave,
      invoice_type: invoiceType,
      status: finalStatus,
      items: validItemsForApi,
      subtotal: subtotalCalc,
      discount,
      total: Math.max(0, subtotalCalc - discount),
      paid_amount: paidAmount,
      treasury_id: paidAmount > 0 ? treasuryId : undefined,
      payment_method: paymentMethod,
      notes,
    });
    if (error) { alert('❌ ' + error); return; }
    alert(`✅ تم حفظ الفاتورة رقم ${data?.invoice_number}`);
    setCart([]);
    setDiscount(0);
    setPaidAmount(0);
    setNotes("");
    // ✅ router.refresh() يمسح Next.js Router Cache عشان /sales يجيب بيانات جديدة
    router.refresh();
    if (finalStatus === 'مكتملة') {
      router.push(`/print/invoice/${data?.id}`);
    } else {
      router.push(`/sales`);
    }
  }

  const customerOptions: SearchOption[] = (customers?.items || []).map(c => ({
    id: c.id,
    name: c.name,
    sub: c.phone || undefined,
    extra: `مديون: ${formatEGP(c.balance)} ج`,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Products panel */}
      <div className="lg:col-span-2 space-y-3">
        <h1 className="text-2xl font-extrabold text-slate-650">🛒 إنشاء فاتورة مبيعات</h1>
        <div className="card">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 ابحث عن صنف بالاسم أو الباركود..."
            className="input-field"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[600px] overflow-y-auto">
          {loadingProducts ? (
            <div className="col-span-full card text-center py-12 text-gray-500 font-bold">
              ⏳ جاري تحميل قائمة الأصناف...
            </div>
          ) : (productsData?.items || []).length > 0 ? (
            productsData?.items.map(p => {
              const breakdown = storeBreakdown(p);
              const selectedStoreStock = stockFor(p, primaryStoreId);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="card text-right transition-all p-3 hover:border-elnesr-500 hover:shadow-lg bg-white border border-gray-100"
                >
                  <div className="font-bold text-sm text-gray-800 line-clamp-2">{p.name}</div>
                  <div className="mt-2 space-y-0.5">
                    <div className="text-xs flex justify-end items-center">
                      <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded font-bold ${selectedStoreStock > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        المتاح: {formatQty(selectedStoreStock)}
                      </span>
                    </div>
                    {breakdown.length > 0 && (
                      <div className="text-[10px] text-gray-500 font-mono truncate">
                        {breakdown.map(s => `${s.name}: ${formatQty(s.available)}`).join(' • ')}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="col-span-full card p-6 text-center">
              <p className="text-gray-500 mb-3 font-semibold">
                {search.trim() ? `لا توجد نتائج لـ "${search}"` : 'لا توجد أصناف مسجلة بالنظام'}
              </p>
              <button
                type="button"
                onClick={() => setShowNewProduct(true)}
                className="btn-primary text-sm"
              >+ إضافة صنف جديد</button>
            </div>
          )}
        </div>
      </div>

      {/* Cart panel */}
      <div className="space-y-3">
        <div className="card space-y-2">
          <h2 className="font-bold text-lg">🛍️ السلة ({cart.length})</h2>
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">🏢 مخزن البيع *</label>
            <select
              className="input-field text-sm font-bold border-elnesr-500 bg-orange-50/40"
              value={primaryStoreId}
              onChange={(e) => setPrimaryStoreId(e.target.value)}
            >
              {(stores?.items || []).map(s => (
                <option key={s.id} value={s.id}>🏢 {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">العميل</label>
            <SearchableSelect
              options={customerOptions}
              value={customerId}
              onChange={setCustomerId}
              placeholder="🔍 ابحث عن عميل بالاسم أو الهاتف..."
              emptyLabel="— بدون عميل —"
            />
            {customerId && selectedCustomer && (
              <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-lg p-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💳</span>
                  <div>
                    <span className="text-gray-600 block text-[11px] font-semibold">رصيد العميل الحالي:</span>
                    <strong className={`font-mono text-sm ${Number(selectedCustomer.balance) > 0 ? 'text-amber-800 font-bold' : 'text-emerald-800'}`}>
                      {formatEGP(Number(selectedCustomer.balance))} ج
                    </strong>
                  </div>
                </div>

              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">النوع</label>
            <select
              className="input-field text-sm"
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value)}
            >
              <option value="عادية">عادية</option>
              <option value="ضريبية">ضريبية</option>
              <option value="عرض سعر">عرض سعر</option>
            </select>
          </div>
          {invoiceType !== 'عرض سعر' && (
            <div>
              <label className="text-xs text-gray-600 block mb-1">حالة الفاتورة</label>
              <select
                className="input-field text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="قيد التنفيذ">قيد التنفيذ (مسودة — قابلة للتعديل)</option>
                <option value="مكتملة">مكتملة (نهائية — تخصم المخزون)</option>
              </select>
            </div>
          )}
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
                          onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                        />
                        <button type="button" onClick={() => adjustQty(i, 1)} className="w-6 h-7 shrink-0 rounded bg-gray-200 text-gray-700 font-bold hover:bg-gray-300">+</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">سعر الوحدة (ج)</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="input-field text-xs p-1"
                        value={c.unit_price}
                        onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">الإجمالي</label>
                      <div className="text-xs font-bold text-elnesr-600 text-center p-1 bg-white rounded border">{formatEGP((parseFloat(c.quantity) || 0) * (parseFloat(c.unit_price) || 0))}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1 items-center">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">المخزن</label>
                      <select
                        className="input-field text-[11px] p-1"
                        value={c.store_id}
                        onChange={(e) => {
                          const newStoreId = e.target.value;
                          const newStore = stores?.items.find(s => s.id === newStoreId);
                          // ✅ functional updater
                          setCart(prev => prev.map((row, idx) => idx === i ? { ...row, store_id: newStoreId, store_name: newStore?.name || '', available: stockFor(c.product_ref, newStoreId) } : row));
                        }}
                      >
                        {(stores?.items || []).map(s => {
                          const available = stockFor(c.product_ref, s.id);
                          return (
                            <option key={s.id} value={s.id}>
                              {s.name}{available > 0 ? ` (${formatQty(available)})` : ' (فارغ)'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      متاح هنا: {formatQty(c.available)}
                      {parseFloat(c.quantity) > c.available && c.available > 0 && (
                        <span className="text-red-600 font-bold block">⚠️ الكمية أكبر من المتاح</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card space-y-2.5">
          <div className="flex justify-between text-sm"><span>الإجمالي قبل الخصم:</span><span className="font-bold">{formatEGP(subtotal)} ج</span></div>
          <div className="flex justify-between items-center text-sm">
            <span>الخصم:</span>
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-24 input-field text-sm p-1"
              value={discount === 0 ? '' : discount}
              onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0"
            />
          </div>
          <div className="flex justify-between text-base font-extrabold border-t pt-1.5 text-slate-800">
            <span>صافي الفاتورة:</span><span className="text-elnesr-600 font-mono">{formatEGP(total)} ج</span>
          </div>

          {/* حقول الدفع الفوري — فقط لو مكتملة (قيد التنفيذ لا يسجل مدفوعات حقيقية) */}
          {invoiceType !== 'عرض سعر' && status === 'مكتملة' && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-emerald-950">المبلغ المدفوع (ج):</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-28 input-field text-sm p-1 text-center font-mono font-extrabold border-emerald-300"
                  value={paidAmount === 0 ? '' : paidAmount}
                  onChange={(e) => setPaidAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                />
              </div>

              {paidAmount > 0 && (
                <div className="grid grid-cols-2 gap-1.5 pt-1 text-xs">
                  <div>
                    <label className="text-[10px] text-emerald-800 font-bold block mb-0.5">الخزينة المستلمة</label>
                    <select
                      className="input-field text-xs p-1 bg-white"
                      value={treasuryId}
                      onChange={(e) => setTreasuryId(e.target.value)}
                    >
                      {(treasuriesData?.items || []).map((t) => (
                        <option key={t.id} value={t.id}>🏦 {t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-800 font-bold block mb-0.5">طريقة الدفع</label>
                    <select
                      className="input-field text-xs p-1 bg-white"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="نقدي">💵 نقدي</option>
                      <option value="إنستاباي">📱 إنستاباي</option>
                      <option value="فودافون كاش">📱 فودافون كاش</option>
                      <option value="تحويل بنكي">🏛️ تحويل بنكي</option>
                      <option value="شيك">📄 شيك</option>
                    </select>
                  </div>
                </div>
              )}

            </div>
          )}

          {selectedCustomer && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-gray-600">
                <span>رصيد العميل السابق:</span>
                <strong className={`font-mono ${Number(selectedCustomer.balance || 0) > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700'}`}>
                  {formatEGP(Number(selectedCustomer.balance || 0))} ج
                </strong>
              </div>
              <div className="flex justify-between items-center text-gray-700 font-bold pt-1.5 border-t border-slate-200">
                <span>المتبقي على العميل:</span>
                <span className="font-mono text-elnesr-700 font-extrabold text-sm">
                  {formatEGP(Number(selectedCustomer.balance || 0) + (Number(total || 0) - Number(paidAmount || 0)))} ج
                </span>
              </div>
            </div>
          )}

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

      {showPaymentModal && (
        <CustomerPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          defaultCustomerId={customerId}
          defaultCustomerName={selectedCustomer?.name}
        />
      )}
      
      {smartSplitItem && stores && (
        <SmartSplitModal
          item={smartSplitItem}
          stores={stores.items}
          onClose={() => setSmartSplitItem(null)}
          onConfirm={handleSmartSplitConfirm}
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
    if (f.default_sale_price < 0 || f.last_purchase_price < 0) { alert('❌ الأسعار يجب أن تكون موجبة'); return; }
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
            <label className="text-sm font-medium block mb-1">سعر البيع *</label>
            <input type="number" step="0.01" min={0} className="input-field" value={f.default_sale_price === 0 ? '' : f.default_sale_price} onChange={(e) => setF({ ...f, default_sale_price: parseFloat(e.target.value) || 0 })} placeholder="0" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">سعر الشراء *</label>
            <input type="number" step="0.01" min={0} className="input-field" value={f.last_purchase_price === 0 ? '' : f.last_purchase_price} onChange={(e) => setF({ ...f, last_purchase_price: parseFloat(e.target.value) || 0 })} placeholder="0" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">الفئة</label>
          <input className="input-field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="مثال: إضاءة، كشافات، أسلاك..." />
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

function SmartSplitModal({ item, stores, onClose, onConfirm }: {
  item: { product: Product, requestedQty: number, currentStoreId: string },
  stores: Store[],
  onClose: () => void,
  onConfirm: (splits: { store_id: string, store_name: string, quantity: number }[]) => void
}) {
  const { product, requestedQty } = item;
  
  // تجميع المخزون لكل مخزن
  const storeStocks = stores.map(store => {
    const invItem = product.inventory_items?.find(i => i.store_id === store.id);
    return {
      store_id: store.id,
      store_name: store.name,
      available: invItem ? Number(invItem.current_stock) : 0,
      quantity: 0
    };
  }).filter(s => s.available > 0);
  
  // توزيع تلقائي للكمية المطلوبة
  const [splits, setSplits] = useState(() => {
    let remaining = requestedQty;
    const initialSplits = storeStocks.map(s => ({ ...s, quantity: 0 }));
    
    // الأولوية للمخزن الحالي المختار
    const currentStore = initialSplits.find(s => s.store_id === item.currentStoreId);
    if (currentStore && currentStore.available > 0) {
      const take = Math.min(remaining, currentStore.available);
      currentStore.quantity = take;
      remaining -= take;
    }
    
    // توزيع الباقي على المخازن الأخرى
    for (const s of initialSplits) {
      if (remaining <= 0) break;
      if (s.store_id === item.currentStoreId) continue; // تم خصمه بالفعل
      const take = Math.min(remaining, s.available);
      s.quantity = take;
      remaining -= take;
    }
    
    return initialSplits;
  });

  const totalAssigned = splits.reduce((sum, s) => sum + s.quantity, 0);

  function handleQuantityChange(store_id: string, qty: number) {
    setSplits(splits.map(s => {
      if (s.store_id !== store_id) return s;
      return { ...s, quantity: Math.max(0, Math.min(qty, s.available)) };
    }));
  }

  function confirm() {
    if (totalAssigned <= 0) {
      alert('يجب توزيع كمية واحدة على الأقل');
      return;
    }
    onConfirm(splits);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-2">💡</div>
          <h2 className="text-lg font-bold">توزيع ذكي للمخزون</h2>
          <p className="text-sm text-gray-500 mt-1">
            الصنف "{product.name}" غير كافٍ في المخزن المختار.<br/>تم اقتراح سحبه من مخازن متعددة.
          </p>
        </div>
        
        <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex justify-between font-bold border border-blue-100">
          <span>الكمية المطلوبة: {requestedQty}</span>
          <span>إجمالي المتاح: {product.total_stock}</span>
        </div>

        <div className="space-y-2">
          {splits.map(s => (
            <div key={s.store_id} className="flex items-center justify-between bg-gray-50 p-2 rounded border">
              <div>
                <div className="font-semibold text-sm">{s.store_name}</div>
                <div className="text-xs text-gray-500">متاح: {formatQty(s.available)}</div>
              </div>
              <input
                type="number"
                min={0}
                max={s.available}
                value={s.quantity || ''}
                onChange={(e) => handleQuantityChange(s.store_id, parseFloat(e.target.value) || 0)}
                className="input-field w-20 text-center font-mono"
              />
            </div>
          ))}
        </div>
        
        <div className="flex justify-between items-center text-sm font-bold pt-2 border-t">
          <span>الإجمالي الموزع:</span>
          <span className={totalAssigned === requestedQty ? 'text-green-600' : 'text-orange-600'}>
            {totalAssigned} / {requestedQty}
          </span>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={confirm} className="btn-primary flex-1">اعتماد التوزيع</button>
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
