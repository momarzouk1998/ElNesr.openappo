"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import { captureElementToCanvas, downloadCanvasAsPng } from "@/lib/html2canvas-safe";
import { LOGO_BASE64 } from "@/lib/logo-base64";

interface CustomerAdjustmentReceiptModalProps {
  adjustmentId: string;
  onClose: () => void;
}

export default function CustomerAdjustmentReceiptModal({
  adjustmentId,
  onClose,
}: CustomerAdjustmentReceiptModalProps) {
  const { data: adj, loading } = useApi<any>(`/api/customers/adjustments/${adjustmentId}`);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح إيصال السلفة...</p>
        </div>
      </div>
    );
  }

  if (!adj) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على سجل السلفة</p>
          <button onClick={onClose} className="btn-secondary text-xs">إغلاق</button>
        </div>
      </div>
    );
  }

  const isDebit = adj.type === "debit";
  const prevBal = Number(adj.prev_balance || 0);
  const adjAmt = Number(adj.amount || 0);
  const newBal = Number(adj.new_balance || 0);
  const adjDate = adj.adjustment_date || adj.created_at;
  const customerName = adj.customer?.name || "العميل المحترم";
  const docTitle = isDebit ? "إيصال سلفة نقدية" : "إيصال تسوية حساب";

  // WhatsApp Share
  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById("adjustment-sheet-" + adjustmentId);
    if (!element) return;
    try {
      setSharingWhatsapp(true);
      const canvas = await captureElementToCanvas(element, { scale: 2 });

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob], `advance_${adjustmentId.slice(0, 8)}.png`, { type: "image/png" });
            if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `${docTitle} - شركة النسر`,
              });
              return;
            }
            await navigator.share({ files: [file] });
            return;
          }
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") return;
          console.warn("Native share error, falling back to download:", shareErr);
        }
      }

      await downloadCanvasAsPng(canvas, `${docTitle}_${customerName}.png`);
      const msgText = isDebit
        ? `مرحباً أستاذ ${customerName}، مرفق إيصال صرف سلفة نقدية من شركة النسر بمبلغ ${formatEGP(adjAmt)} ج (إجمالي الحساب المطلوب بعد السلفة: ${formatEGP(newBal)} ج).`
        : `مرحباً أستاذ ${customerName}، مرفق إيصال تسوية حساب من شركة النسر بمبلغ ${formatEGP(adjAmt)} ج (إجمالي الحساب المتبقي: ${formatEGP(newBal)} ج).`;
      window.location.href = `whatsapp://send?text=${encodeURIComponent(msgText)}`;
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تجهيز الإيصال للمشاركة");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  // Download image
  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById("adjustment-sheet-" + adjustmentId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const canvas = await captureElementToCanvas(element, { scale: 2 });
      await downloadCanvasAsPng(canvas, `${docTitle}_${customerName}.png`);
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تنزيل الإيصال كصورة");
    } finally {
      setDownloadingImage(false);
    }
  };

  // Open printable page
  const handlePrint = () => {
    window.open(`/print/adjustment/customer/${adjustmentId}?autoprint=1`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden my-auto animate-scale-up border border-slate-200">
        {/* Top Control Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isDebit ? "💸" : "📝"}</span>
            <span className="font-extrabold text-sm sm:text-base">{docTitle}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handlePrint}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all flex items-center gap-1 cursor-pointer"
              title="طباعة الإيصال"
            >
              <span>🖨️</span>
              <span className="hidden sm:inline">طباعة</span>
            </button>
            <button
              onClick={handleShareWhatsapp}
              disabled={sharingWhatsapp}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-all flex items-center gap-1 shadow cursor-pointer disabled:opacity-50"
              title="مشاركة عبر واتساب"
            >
              <span>📲</span>
              <span>{sharingWhatsapp ? "جاري..." : "واتساب"}</span>
            </button>
            <button
              onClick={handleDownloadImage}
              disabled={downloadingImage}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-xs font-bold text-slate-900 transition-all flex items-center gap-1 shadow cursor-pointer disabled:opacity-50"
              title="حفظ كصورة"
            >
              <span>📥</span>
              <span className="hidden sm:inline">حفظ كصورة</span>
            </button>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer" aria-label="إغلاق">
              ✕
            </button>
          </div>
        </div>

        {/* The Printable Receipt Card */}
        <div id={"adjustment-sheet-" + adjustmentId} className="bg-white p-4 sm:p-6 text-slate-900 text-right font-sans">
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4 mb-4 gap-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white border-2 border-amber-500 p-1 flex items-center justify-center shrink-0">
                <img src={LOGO_BASE64} alt="شركة النسر" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="text-base sm:text-lg font-black text-slate-900 leading-tight">شركة النسر</div>
                <div className="text-xs font-bold text-amber-600">للأدوات واللوحات الكهربائية</div>
              </div>
            </div>
            <div className="text-left">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-black text-white ${isDebit ? "bg-amber-600" : "bg-emerald-600"}`}>
                {isDebit ? "إيصال سلفة نقدية 💸" : "إيصال تسوية حساب 📝"}
              </span>
              <div className="text-[11px] text-slate-500 font-mono mt-1">{formatDate(adjDate)}</div>
            </div>
          </div>

          {/* Customer & Transaction Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-bold">العميل المكرم:</span>
              <span className="font-extrabold text-slate-900 text-base">{customerName}</span>
            </div>
            {adj.customer?.phone && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">الهاتف:</span>
                <span className="font-mono font-bold text-slate-700">{adj.customer.phone}</span>
              </div>
            )}
            {adj.treasury && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">{isDebit ? "الخزينة المنصرف منها:" : "الخزينة المودع بها:"}</span>
                <span className="font-bold text-emerald-700">{adj.treasury.name}</span>
              </div>
            )}
            {adj.notes && (
              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-bold block mb-0.5">البيان / سبب العملية:</span>
                <span className="font-semibold text-slate-800 bg-amber-50/60 p-1.5 rounded-lg block border border-amber-200/60">
                  {adj.notes}
                </span>
              </div>
            )}
          </div>

          {/* Financial Breakdown Table */}
          <div className="border-2 border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className="grid grid-cols-3 bg-slate-100 text-slate-700 font-extrabold text-xs text-center py-2 border-b">
              <div>الحساب السابق</div>
              <div className={isDebit ? "text-amber-700 font-black" : "text-emerald-700 font-black"}>
                {isDebit ? "مبلغ السلفة (+)" : "مبلغ التسوية (-)"}
              </div>
              <div className="text-slate-900 font-black">= الرصيد المطلوب</div>
            </div>
            <div className="grid grid-cols-3 text-center py-3 font-mono font-black text-sm sm:text-base items-center">
              <div className="text-slate-600">{formatEGP(prevBal)} ج</div>
              <div className={`p-1.5 rounded-lg mx-1 ${isDebit ? "bg-amber-50 text-amber-700 font-black" : "bg-emerald-50 text-emerald-700 font-black"}`}>
                {isDebit ? `+ ${formatEGP(adjAmt)}` : `- ${formatEGP(adjAmt)}`} ج
              </div>
              <div className="text-rose-600 text-base sm:text-lg font-black bg-rose-50/50 p-1 rounded-lg mx-1">
                {formatEGP(newBal)} ج
              </div>
            </div>
          </div>

          {/* Micro Footer */}
          <div className="text-center text-[11px] text-slate-400 font-medium pt-2 border-t">
            شركة النسر • إيصال رسمي معتمد • شكراً لتعاملكم معنا
          </div>
        </div>

        {/* Modal Bottom Buttons */}
        <div className="bg-slate-50 border-t p-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
