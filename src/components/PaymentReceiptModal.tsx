"use client";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import { captureElementToCanvas, downloadCanvasAsPng } from "@/lib/html2canvas-safe";

export interface PaymentReceiptModalProps {
  paymentId?: string;
  adjustmentId?: string;
  onClose: () => void;
}

export default function PaymentReceiptModal({ paymentId, adjustmentId, onClose }: PaymentReceiptModalProps) {
  const isAdjustment = !!adjustmentId;
  const activeId = (adjustmentId || paymentId || "") as string;
  const endpoint = isAdjustment
    ? `/api/customers/adjustments/${adjustmentId}`
    : `/api/payments/customers/${paymentId}`;

  const { data: record, loading } = useApi<any>(endpoint);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">
            {isAdjustment ? "جاري فتح إيصال السلفة..." : "جاري فتح إيصال التحصيل..."}
          </p>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على الإيصال</p>
          <button onClick={onClose} className="btn-secondary text-xs">إغلاق</button>
        </div>
      </div>
    );
  }

  const isDebit = isAdjustment ? record.type === "debit" : false;
  const prevBal = Number(record.prev_balance || 0);
  const amount  = Number(record.amount || 0);
  const newBal  = Number(record.new_balance || 0);
  const dateVal = record.payment_date || record.adjustment_date || record.created_at;
  const customerName = record.customer?.name || "العميل المحترم";

  // Document labels and badge colors
  let docTitle = "إيصال تحصيل نقدية";
  let badgeColor = "#059669";
  let amountBoxTitle = "المبلغ المحصل";
  let amountBoxBg = "#ecfdf5";
  let amountBoxBorder = "#10b981";
  let amountBoxColor = "#047857";
  let treasuryLabel = "الخزينة المودع بها:";

  if (isAdjustment) {
    if (isDebit) {
      docTitle = "إيصال سلفة نقدية";
      badgeColor = "#d97706";
      amountBoxTitle = "مبلغ السلفة المنصرفة";
      amountBoxBg = "#fffbeb";
      amountBoxBorder = "#f59e0b";
      amountBoxColor = "#b45309";
      treasuryLabel = "الخزينة المنصرف منها:";
    } else {
      docTitle = "إيصال تسوية حساب";
      badgeColor = "#059669";
      amountBoxTitle = "مبلغ التسوية";
      amountBoxBg = "#ecfdf5";
      amountBoxBorder = "#10b981";
      amountBoxColor = "#047857";
      treasuryLabel = "الخزينة المودع بها:";
    }
  }

  // ─── Direct WhatsApp Share Handler: Native Image Share ────────────────────────
  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById("receipt-sheet-" + activeId);
    if (!element) {
      alert("❌ تعذر العثور على محتوى الإيصال");
      return;
    }
    try {
      setSharingWhatsapp(true);

      const canvas = await captureElementToCanvas(element, { scale: 2 });

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob], `receipt_${activeId.slice(0, 8)}.png`, { type: "image/png" });

            // Native Mobile Share with Image File
            if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `${docTitle} - شركة النسر`,
              });
              return;
            }

            // Fallback Native Share
            await navigator.share({
              files: [file],
            });
            return;
          }
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") return;
          console.warn("Native share error, falling back to download:", shareErr);
        }
      }

      // Desktop / Non-WebShare Fallback: Download image & Open WhatsApp Contact Chooser
      await downloadCanvasAsPng(canvas, `${docTitle}_${customerName}.png`);

      let receiptText = "";
      if (isAdjustment) {
        receiptText = isDebit
          ? `مرحباً أستاذ ${customerName}، مرفق إيصال سلفة نقدية من شركة النسر بقيمة ${formatEGP(amount)} ج (إجمالي الحساب بعد السلفة: ${formatEGP(newBal)} ج).`
          : `مرحباً أستاذ ${customerName}، مرفق إيصال تسوية حساب من شركة النسر بقيمة ${formatEGP(amount)} ج (المتبقي: ${formatEGP(newBal)} ج).`;
      } else {
        receiptText = `مرحباً أستاذ ${customerName}، مرفق إيصال تحصيل شركة النسر بقيمة ${formatEGP(amount)} ج (المتبقي: ${formatEGP(newBal)} ج).`;
      }

      window.location.href = `whatsapp://send?text=${encodeURIComponent(receiptText)}`;
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تجهيز الإيصال للمشاركة");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  // ─── Download image ─────────────────────────────────────────────────────────
  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById("receipt-sheet-" + activeId);
    if (!element) {
      alert("❌ تعذر العثور على محتوى الإيصال");
      return;
    }
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

  // ─── Open printable page ────────────────────────────────────────────────────
  const handlePrint = () => {
    if (isAdjustment) {
      window.open(`/print/adjustment/customer/${activeId}?autoprint=1`, "_blank");
    } else {
      window.open(`/print/payment/customer/${activeId}?autoprint=1`, "_blank");
    }
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
            id={"receipt-sheet-" + activeId}
            className="rounded-xl p-4 space-y-3 text-right"
            style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
          >
            {/* Header */}
            <div style={{ paddingBottom: "12px", borderBottom: "2px solid #f1f5f9" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl p-1 shrink-0 flex items-center justify-center" style={{ backgroundColor: "#ffffff", border: `2px solid ${badgeColor}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                    <img src="/logo.png" alt="شركة النسر" className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-base leading-tight" style={{ color: "#0f172a" }}>شركة النسر</h3>
                    <p className="text-xs font-bold" style={{ color: "#64748b" }}>للأدوات واللوحات الكهربائية</p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span style={{ backgroundColor: badgeColor, color: "#ffffff", fontSize: "11px", fontWeight: 800, padding: "4px 10px", borderRadius: "9999px", whiteSpace: "nowrap", display: "inline-block" }}>
                    {docTitle}
                  </span>
                  <p className="font-bold mt-1" style={{ color: "#94a3b8", fontSize: "11px" }}>{formatDate(dateVal)}</p>
                </div>
              </div>
            </div>

            {/* Customer info */}
            <div className="rounded-xl p-3 flex items-center justify-between text-xs" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div>
                <span style={{ color: "#94a3b8", fontWeight: 500 }}>العميل: </span>
                <strong className="text-sm font-black mr-1" style={{ color: "#0f172a" }}>{record.customer?.name || "عميل عام"}</strong>
              </div>
              {record.customer?.phone && (
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#ffffff", color: "#475569", border: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                  📞 {record.customer.phone}
                </span>
              )}
            </div>

            {/* Amount box */}
            <div className="rounded-xl p-3.5 text-center" style={{ backgroundColor: amountBoxBg, border: `2px solid ${amountBoxBorder}` }}>
              <p className="text-xs font-bold mb-1" style={{ color: amountBoxColor }}>{amountBoxTitle}</p>
              <p className="text-2xl font-black font-mono" style={{ color: amountBoxColor }}>
                {formatEGP(amount)} <span className="text-sm font-bold">ج.م</span>
              </p>
              {record.payment_method && (
                <p className="text-[11px] mt-1 font-semibold" style={{ color: "#059669" }}>طريقة الدفع: {record.payment_method}</p>
              )}
            </div>

            {/* Balances summary */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-xl p-2.5" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <p className="text-[11px] mb-0.5 font-semibold" style={{ color: "#64748b" }}>الحساب السابق</p>
                <p className="font-extrabold font-mono text-sm" style={{ color: "#334155" }}>{formatEGP(prevBal)} ج</p>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: "#f0f9ff", border: "2px solid #0284c7" }}>
                <p className="text-[11px] mb-0.5 font-black" style={{ color: "#0369a1" }}>المتبقي النهائي</p>
                <p className="font-black font-mono text-sm" style={{ color: "#0c4a6e" }}>{formatEGP(newBal)} ج</p>
              </div>
            </div>

            {/* Treasury info */}
            {record.treasury && (
              <div className="text-xs flex items-center justify-between px-1" style={{ color: "#94a3b8" }}>
                <span>{treasuryLabel}</span>
                <strong style={{ color: "#334155" }}>{record.treasury.name}</strong>
              </div>
            )}

            {record.notes && (
              <div className="rounded-xl p-2.5 text-xs font-medium" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                <strong>ملاحظة: </strong>{record.notes}
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
          {/* WhatsApp — native image share */}
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
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 active:scale-95 text-white text-sm font-bold px-3 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
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
