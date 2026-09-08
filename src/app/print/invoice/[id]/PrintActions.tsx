"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";
import { InvoiceImageDownloadButton } from "@/components/InvoiceImageDownloadButton";
import { WhatsAppShareButton } from "@/components/WhatsAppShareButton";
import CustomerPaymentModal from "@/components/CustomerPaymentModal";

export default function PrintActions({
  autoprint,
  downloadImage = false,
  downloadPdf = false,
  backLink = "/sales",
  backLabel = "↩️ عودة",
  fileName = "فاتورة شركة النسر",
  targetId = "statement",
  invoiceId,
  customerId,
  customerName,
  customerPhone,
  title = "المستند",
  isCancelled,
}: {
  autoprint?: boolean;
  downloadImage?: boolean;
  downloadPdf?: boolean;
  backLink?: string;
  backLabel?: string;
  fileName?: string;
  targetId?: string;
  invoiceId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string | null;
  title?: string;
  isCancelled?: boolean;
}) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (autoprint) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [autoprint]);

  useEffect(() => {
    if (downloadImage) {
      const triggerDownload = async () => {
        await new Promise(resolve => setTimeout(resolve, 800));
        const downloadBtn = document.querySelector("button[title*='حفظ الفاتورة كصورة']") as HTMLButtonElement | null;
        if (downloadBtn) {
          downloadBtn.click();
          setTimeout(() => {
            try {
              window.close();
            } catch (err) {
              console.warn(err);
            }
          }, 3500);
        }
      };
      triggerDownload();
    }
  }, [downloadImage]);

  useEffect(() => {
    if (downloadPdf) {
      const triggerDownloadPdf = async () => {
        await new Promise(resolve => setTimeout(resolve, 850));
        const pdfBtn = document.getElementById("pdf-download-btn") as HTMLButtonElement | null;
        if (pdfBtn) {
          pdfBtn.click();
          setTimeout(() => {
            try {
              window.close();
            } catch (err) {
              console.warn(err);
            }
          }, 3500);
        }
      };
      triggerDownloadPdf();
    }
  }, [downloadPdf]);

  function handleClose() {
    try {
      window.close();
    } catch {}
    setTimeout(() => {
      window.location.href = backLink;
    }, 150);
  }

  return (
    <>
      <div className="no-print max-w-[800px] mx-auto mt-2 mb-6 px-2 flex flex-wrap gap-2 justify-center items-center">
        {/* زر إرسال واتساب المباشر */}
        <WhatsAppShareButton
          targetId={targetId}
          fileName={fileName}
          recipientPhone={customerPhone}
          recipientName={customerName}
          title={title}
        />

        {/* زر صورة واتساب + نسخ (يخفى على شاشات الجوال الصغيرة) */}
        <div className="hidden sm:inline-flex">
          <InvoiceImageDownloadButton targetId={targetId} fileName={fileName} label="🖼️ صورة" />
        </div>

        {/* زر PDF */}
        <PdfDownloadButton targetId={targetId} fileName={fileName} label="📄 PDF" />

        {/* زر الطباعة (يخفى على شاشات الجوال الصغيرة) */}
        <button
          onClick={() => window.print()}
          className="hidden sm:flex bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all items-center gap-1.5 active:scale-95 cursor-pointer"
        >
          <span>🖨️</span>
          <span>طباعة</span>
        </button>

        {/* زر تحصيل */}
        {customerId && !isCancelled && (
          <button
            onClick={() => setShowPaymentModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
            title="تسجيل دفعة جديدة من العميل"
          >
            <span>💳</span>
            <span>تحصيل</span>
          </button>
        )}

        {/* زر إغلاق / عودة */}
        <button
          onClick={handleClose}
          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer active:scale-95"
          title="إغلاق أو العودة"
        >
          <span>✕</span>
          <span>إغلاق</span>
        </button>
      </div>

      {showPaymentModal && customerId && (
        <CustomerPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          defaultCustomerId={customerId}
          defaultCustomerName={customerName}
          defaultInvoiceId={invoiceId}
          onSuccess={() => {
            setShowPaymentModal(false);
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
