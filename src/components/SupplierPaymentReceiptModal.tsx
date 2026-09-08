"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import { captureElementToCanvas, downloadCanvasAsPng } from "@/lib/html2canvas-safe";

interface SupplierPaymentReceiptModalProps {
  paymentId: string;
  onClose: () => void;
}

export default function SupplierPaymentReceiptModal({ paymentId, onClose }: SupplierPaymentReceiptModalProps) {
  const { data: payment, loading } = useApi<any>(`/api/payments/suppliers/${paymentId}`);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح إيصال السداد...</p>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على إيصال السداد</p>
          <button onClick={onClose} className="btn-secondary text-xs">إغلاق</button>
        </div>
      </div>
    );
  }

  const prevBal = Number(payment.prev_balance || 0);
  const paid    = Number(payment.amount || 0);
  const newBal  = Number(payment.new_balance || 0);
  const payDate = payment.payment_date || payment.created_at;
  const supplierName = payment.supplier?.name || "المورد المحترم";

  // ─── Direct WhatsApp Share Handler ───────────────────────────────────────────
  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById("supplier-receipt-sheet-" + paymentId);
    if (!element) return;
    try {
      setSharingWhatsapp(true);

      const canvas = await captureElementToCanvas(element, { scale: 2 });

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob], `receipt_${paymentId.slice(0, 8)}.png`, { type: "image/png" });

            if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "إيصال سداد شركة النسر",
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

      await downloadCanvasAsPng(canvas, `إيصال_سداد_${supplierName}.png`);

      const receiptText = `مرحباً أستاذ ${supplierName}، مرفق إيصال سداد شركة النسر بقيمة ${formatEGP(paid)} ج (المتبقي: ${formatEGP(newBal)} ج)`;
      window.location.href = `whatsapp://send?text=${encodeURIComponent(receiptText)}`;
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تجهيز إيصال السداد للمشاركة");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  // ─── Download image ──────────────────────────────────────────────────────────
  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById("supplier-receipt-sheet-" + paymentId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5 });
      await downloadCanvasAsPng(canvas, `إيصال_سداد_${supplierName}.png`);
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تحميل الصورة");
    } finally {
      setDownloadingImage(false);
    }
  };

  // ─── Print page ──────────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.open(`/print/payment/supplier/${paymentId}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
      >
        {/* ── Receipt Sheet ───────────────────────────────────────────────── */}
        <div className="p-3 sm:p-5 overflow-y-auto max-h-[80vh]">
          <div
            id={"supplier-receipt-sheet-" + paymentId}
            className="rounded-xl p-4 space-y-3 text-right"
            style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
          >
            {/* Header */}
            <div style={{ paddingBottom: "12px", borderBottom: "2px solid #f1f5f9" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl p-1 shrink-0 flex items-center justify-center" style={{ backgroundColor: "#ffffff", border: "2px solid #7c3aed", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                    <img src="/logo.png" alt="شركة النسر" className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-base leading-tight" style={{ color: "#0f172a" }}>شركة النسر</h3>
                    <p className="text-xs font-bold" style={{ color: "#64748b" }}>للأدوات واللوحات الكهربائية</p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span style={{ backgroundColor: "#7c3aed", color: "#ffffff", fontSize: "11px", fontWeight: 800, padding: "4px 10px", borderRadius: "9999px", whiteSpace: "nowrap", display: "inline-block" }}>
                    إيصال سداد مورد
                  </span>
                  <p className="font-bold mt-1" style={{ color: "#94a3b8", fontSize: "11px" }}>{formatDate(payDate)}</p>
                </div>
              </div>
            </div>

            {/* Supplier info */}
            <div className="rounded-xl p-3 flex items-center justify-between text-xs" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div>
                <span style={{ color: "#94a3b8", fontWeight: 500 }}>المورد: </span>
                <strong className="text-sm font-black mr-1" style={{ color: "#0f172a" }}>{payment.supplier?.name || "مورد عام"}</strong>
              </div>
              {payment.supplier?.phone && (
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#ffffff", color: "#475569", border: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                  📞 {payment.supplier.phone}
                </span>
              )}
            </div>

            {/* Amount paid box */}
            <div className="rounded-xl p-3.5 text-center" style={{ backgroundColor: "#f5f3ff", border: "2px solid #7c3aed" }}>
              <p className="text-xs font-bold mb-1" style={{ color: "#4c1d95" }}>المبلغ المدفوع</p>
              <p className="text-2xl font-black font-mono" style={{ color: "#6d28d9" }}>
                {formatEGP(paid)} <span className="text-sm font-bold">ج.م</span>
              </p>
              {payment.payment_method && (
                <p className="text-[11px] mt-1 font-semibold" style={{ color: "#7c3aed" }}>طريقة الدفع: {payment.payment_method}</p>
              )}
            </div>

            {/* Balances summary */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-xl p-2.5" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <p className="text-[11px] mb-0.5 font-semibold" style={{ color: "#64748b" }}>الحساب السابق</p>
                <p className="font-extrabold font-mono text-sm" style={{ color: "#334155" }}>{formatEGP(prevBal)} ج</p>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: "#faf5ff", border: "2px solid #7c3aed" }}>
                <p className="text-[11px] mb-0.5 font-black" style={{ color: "#6d28d9" }}>المتبقي النهائي</p>
                <p className="font-black font-mono text-sm" style={{ color: "#4c1d95" }}>{formatEGP(newBal)} ج</p>
              </div>
            </div>

            {/* Treasury info */}
            {payment.treasury && (
              <div className="text-xs flex items-center justify-between px-1" style={{ color: "#94a3b8" }}>
                <span>الخزينة المودع منها:</span>
                <strong style={{ color: "#334155" }}>{payment.treasury.name}</strong>
              </div>
            )}

            {payment.notes && (
              <div className="rounded-xl p-2.5 text-xs font-medium" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                <strong>ملاحظة: </strong>{payment.notes}
              </div>
            )}

            {/* Footer note */}
            <div className="pt-2 text-center font-semibold" style={{ borderTop: "1px solid #f1f5f9", color: "#94a3b8", fontSize: "11px" }}>
              شكراً لتعاملكم معنا ▪ شركة النسر للأدوات الكهربائية
            </div>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="px-3 pb-3 flex items-center gap-2">
          {/* WhatsApp */}
          <button
            type="button"
            onClick={handleShareWhatsapp}
            disabled={sharingWhatsapp}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 active:scale-95 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <span>{sharingWhatsapp ? "⏳" : "📲"}</span>
            <span>{sharingWhatsapp ? "جاري التجهيز..." : "إرسال واتساب"}</span>
          </button>

          {/* Download image */}
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={downloadingImage}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 active:scale-95 text-white text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="تحميل صورة"
          >
            {downloadingImage ? "⏳" : "🖼️"}
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={handlePrint}
            className="bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center shadow-sm transition-all cursor-pointer"
            title="طباعة"
          >
            🖨️
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 text-sm font-bold px-3 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
