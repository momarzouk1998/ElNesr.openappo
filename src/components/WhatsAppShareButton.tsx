"use client";

import { useState } from "react";
import { captureElementToCanvas, downloadCanvasAsPng } from "@/lib/html2canvas-safe";

export function WhatsAppShareButton({
  targetId = "statement",
  fileName = "كشف_حساب_شركة_النسر",
  recipientPhone,
  recipientName,
  title = "كشف الحساب",
}: {
  targetId?: string;
  fileName?: string;
  recipientPhone?: string | null;
  recipientName?: string | null;
  title?: string;
}) {
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (sharing) return;
    const targetElement = (
      (targetId ? document.getElementById(targetId) : null) ||
      document.getElementById("statement") ||
      document.querySelector(".print-page") ||
      document.querySelector("[id*='statement']")
    ) as HTMLElement | null;

    if (!targetElement) {
      alert("❌ تعذر العثور على محتوى المستند");
      return;
    }

    try {
      setSharing(true);
      const canvas = await captureElementToCanvas(targetElement, { scale: 2.5 });

      const cleanPhone = recipientPhone ? String(recipientPhone).replace(/\D/g, "") : "";
      const formattedPhone = cleanPhone.startsWith("0") ? `2${cleanPhone}` : cleanPhone;
      const name = recipientName || "العميل المحترم";
      const shareText = `مرحباً بك أستاذ ${name}،\nمرفق ${title} الخاص بكم من شركة النسر للأدوات واللوحات الكهربائية.\nشكراً لتعاملكم معنا.`;

      // 1. Native Mobile Web Share API
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob as BlobPart], `report_${Date.now()}.png`, { type: "image/png" });
            if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `${title} - شركة النسر`,
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
          if (shareErr?.name === "AbortError") return;
          console.warn("Native share error, falling back to download:", shareErr);
        }
      }

      // 2. Fallback: Download image and open WhatsApp app directly
      await downloadCanvasAsPng(canvas, `${fileName}.png`);

      window.location.href = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء إرسال كشف الحساب عبر واتساب");
    } finally {
      setSharing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
      title="إرسال صورة كشف الحساب مباشرة للعميل على واتساب"
    >
      <span>{sharing ? "⏳" : "📲"}</span>
      <span>{sharing ? "جاري التجهيز..." : "إرسال واتساب"}</span>
    </button>
  );
}
