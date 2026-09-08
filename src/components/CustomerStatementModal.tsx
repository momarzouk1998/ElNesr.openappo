"use client";
import React, { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatEGP, formatDate } from "@/lib/format";
import { captureElementToCanvas, downloadCanvasAsPng } from "@/lib/html2canvas-safe";

interface CustomerStatementModalProps {
  customerId: string;
  onClose: () => void;
}

export default function CustomerStatementModal({ customerId, onClose }: CustomerStatementModalProps) {
  const { data: statementData, loading } = useApi<any>(`/api/customers/${customerId}/statement`);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-gray-600">جاري فتح كشف الحساب...</p>
        </div>
      </div>
    );
  }

  if (!statementData || !statementData.customer) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-2xl max-w-sm w-full">
          <p className="text-sm font-bold text-red-600">❌ لم يتم العثور على بيانات كشف الحساب</p>
          <button onClick={onClose} className="btn-secondary text-xs">إغلاق</button>
        </div>
      </div>
    );
  }

  const { customer, entries, totalDebit, totalCredit, finalBalance } = statementData;
  const sheetId = "statement-sheet-" + customerId;
  const customerName = customer.name || "العميل المحترم";

  // ─── Native WhatsApp Share: Mobile Native Share Sheet with Image ───────────
  const handleShareWhatsapp = async () => {
    if (sharingWhatsapp) return;
    const element = document.getElementById(sheetId);
    if (!element) return;

    try {
      setSharingWhatsapp(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5, renderWidth: 800 });

      const receiptText = `مرحباً بك أستاذ ${customerName}،\nمرفق كشف حساب شركة النسر للأدوات الكهربائية.\nالمتبقي النهائي: ${formatEGP(finalBalance)} ج\nشكراً لتعاملكم معنا.`;

      // 1. Native Mobile Web Share API
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
          if (blob) {
            const file = new File([blob as BlobPart], `statement_${customerId.slice(0, 8)}.png`, { type: "image/png" });
            if (typeof (navigator as any).canShare === "function" && (navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: "كشف حساب شركة النسر",
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

      // 2. Fallback: Auto download image and open WhatsApp app directly
      await downloadCanvasAsPng(canvas, `كشف_حساب_${customerName}.png`);

      window.location.href = `whatsapp://send?text=${encodeURIComponent(receiptText)}`;
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تجهيز كشف الحساب للمشاركة");
    } finally {
      setSharingWhatsapp(false);
    }
  };

  // ─── Download Image ─────────────────────────────────────────────────────────
  const handleDownloadImage = async () => {
    if (downloadingImage) return;
    const element = document.getElementById(sheetId);
    if (!element) return;
    try {
      setDownloadingImage(true);
      const canvas = await captureElementToCanvas(element, { scale: 2.5, renderWidth: 800 });
      await downloadCanvasAsPng(canvas, `كشف_حساب_${customerName}.png`);
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ أثناء تحميل الصورة");
    } finally {
      setDownloadingImage(false);
    }
  };

  // ─── Print page: opens styled server-rendered page ─────────────────────────
  const handlePrint = () => {
    window.open(`/print/statement/customer/${customerId}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
      >
        {/* ── Statement Sheet Wrapper with horizontal scroll for mobile ──── */}
        <div className="p-2 sm:p-5 overflow-x-auto overflow-y-auto flex-1 bg-slate-100/50">
          <div
            id={sheetId}
            className="rounded-xl p-4 sm:p-6 text-right space-y-4 mx-auto"
            style={{
              direction: "rtl",
              fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
              color: "#0f172a",
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              minWidth: "720px",
              maxWidth: "800px",
              boxSizing: "border-box",
            }}
          >
            {/* Header */}
            <div className="pb-4 flex items-center justify-between gap-3" style={{ borderBottom: "2px solid #f1f5f9" }}>
              <div className="flex items-center gap-3">
                <div className="rounded-xl p-1 bg-white flex items-center justify-center shrink-0 shadow-sm" style={{ width: "56px", height: "56px", minWidth: "56px", minHeight: "56px", border: "2px solid #0284c7" }}>
                  <img src="/logo.png" alt="شركة النسر" style={{ width: "48px", height: "48px", minWidth: "48px", minHeight: "48px", maxWidth: "48px", maxHeight: "48px", objectFit: "contain", display: "block" }} />
                </div>
                <div>
                  <h3 className="font-black text-lg leading-tight" style={{ color: "#0f172a" }}>شركة النسر</h3>
                  <p className="text-xs font-bold" style={{ color: "#0369a1" }}>للأدوات واللوحات الكهربائية ▪ تجارة وتوزيع الجملة</p>
                </div>
              </div>
              <div className="text-left shrink-0">
                <span style={{ backgroundColor: "#0c4a6e", color: "#ffffff", fontSize: "12px", fontWeight: 800, padding: "6px 14px", borderRadius: "9999px", whiteSpace: "nowrap", display: "inline-block" }}>
                  كشف حساب عميل
                </span>
                <p className="text-xs font-semibold mt-1.5" style={{ color: "#94a3b8" }}>
                  التاريخ: {formatDate(new Date())}
                </p>
              </div>
            </div>

            {/* Customer Info Card */}
            <div className="rounded-xl p-3.5 flex items-center justify-between text-sm" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div>
                <span className="text-xs font-semibold" style={{ color: "#64748b" }}>اسم العميل: </span>
                <strong className="text-base font-black mr-1" style={{ color: "#0f172a" }}>{customer.name}</strong>
              </div>
              <div className="flex items-center gap-3">
                {customer.phone && (
                  <span className="font-mono text-xs px-2.5 py-1 rounded-md" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", color: "#475569" }}>
                    📞 {customer.phone}
                  </span>
                )}
              </div>
            </div>

            {/* Financial Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
              <div className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <p className="text-[11px] mb-0.5 font-semibold" style={{ color: "#64748b" }}>رصيد افتتاحي</p>
                <p className="font-extrabold font-mono text-sm" style={{ color: "#1e293b", whiteSpace: "nowrap" }}>{formatEGP(customer.opening_balance || 0)} ج</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
                <p className="text-[11px] mb-0.5 font-bold" style={{ color: "#b91c1c" }}>إجمالي المبيعات (مدين)</p>
                <p className="font-extrabold font-mono text-sm" style={{ color: "#dc2626", whiteSpace: "nowrap" }}>{formatEGP(totalDebit)} ج</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                <p className="text-[11px] mb-0.5 font-bold" style={{ color: "#047857" }}>إجمالي التحصيلات (دائن)</p>
                <p className="font-extrabold font-mono text-sm" style={{ color: "#059669", whiteSpace: "nowrap" }}>{formatEGP(totalCredit)} ج</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "#f0f9ff", border: "2px solid #0284c7" }}>
                <p className="text-[11px] mb-0.5 font-black" style={{ color: "#0369a1" }}>الرصيد المتبقي النهائي</p>
                <p className="font-black font-mono text-base" style={{ color: "#0c4a6e", whiteSpace: "nowrap" }}>
                  {formatEGP(finalBalance)} ج
                </p>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", backgroundColor: "#ffffff" }}>
              <table className="w-full text-xs text-right border-collapse" style={{ tableLayout: "fixed", width: "100%" }}>
                <thead>
                  <tr style={{ backgroundColor: "#0f172a", color: "#ffffff", fontWeight: "bold", fontSize: "11px" }}>
                    <th style={{ padding: "10px", textAlign: "center", width: "36px" }}>#</th>
                    <th style={{ padding: "10px", width: "85px", whiteSpace: "nowrap" }}>التاريخ</th>
                    <th style={{ padding: "10px", width: "auto" }}>البيان / الحركة</th>
                    <th style={{ padding: "10px", textAlign: "center", width: "70px", whiteSpace: "nowrap" }}>المرجع</th>
                    <th style={{ padding: "10px", textAlign: "left", width: "95px", color: "#fca5a5" }}>مدين (+)</th>
                    <th style={{ padding: "10px", textAlign: "left", width: "95px", color: "#6ee7b7" }}>دائن (-)</th>
                    <th style={{ padding: "10px", textAlign: "left", width: "100px", color: "#bae6fd", fontWeight: 900 }}>الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {entries && entries.length > 0 ? (
                    entries.map((e: any, idx: number) => {
                      const hasItems = e.items && e.items.length > 0;
                      return (
                        <React.Fragment key={idx}>
                          <tr
                            style={{ borderTop: "1px solid #f1f5f9", backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}
                          >
                            <td style={{ padding: "8px 10px", textAlign: "center", color: "#94a3b8", fontWeight: "bold" }}>{idx + 1}</td>
                            <td style={{ padding: "8px 10px", color: "#475569", whiteSpace: "nowrap", fontFamily: "monospace" }}>{formatDate(e.date)}</td>
                            <td style={{ padding: "8px 10px", fontWeight: "bold", color: "#1e293b" }}>
                              <span>{e.label}</span>
                              {hasItems && (
                                <span style={{ fontSize: "10px", color: "#0284c7", backgroundColor: "#e0f2fe", padding: "2px 6px", borderRadius: "6px", marginRight: "6px", fontWeight: 800 }}>
                                  📦 {e.items.length} أصناف
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: "#0369a1", fontWeight: "bold", whiteSpace: "nowrap", fontFamily: "monospace" }}>{e.ref}</td>
                            <td style={{ padding: "8px 10px", textAlign: "left", color: "#dc2626", fontWeight: "bold", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                              {e.debit > 0 ? `${formatEGP(e.debit)} ج` : "—"}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "left", color: "#059669", fontWeight: "bold", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                              {e.credit > 0 ? `${formatEGP(e.credit)} ج` : "—"}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "left", color: "#0f172a", fontWeight: 900, fontFamily: "monospace", backgroundColor: "#f1f5f9", whiteSpace: "nowrap" }}>
                              {formatEGP(e.balance)} ج
                            </td>
                          </tr>
                          {/* Nested Items Details Breakdown */}
                          {hasItems && (
                            <tr style={{ backgroundColor: "#f8fafc" }}>
                              <td colSpan={7} style={{ padding: "2px 10px 10px 10px", borderBottom: "1px solid #e2e8f0" }}>
                                <div style={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #cbd5e1", padding: "6px 10px", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", tableLayout: "fixed" }}>
                                    <thead>
                                      <tr style={{ backgroundColor: "#f1f5f9", color: "#475569", fontWeight: "bold", borderBottom: "1px solid #cbd5e1" }}>
                                        <th style={{ padding: "4px 8px", textAlign: "right", width: "45%" }}>الصنف</th>
                                        <th style={{ padding: "4px 8px", textAlign: "center", width: "15%" }}>الكمية</th>
                                        <th style={{ padding: "4px 8px", textAlign: "left", width: "20%" }}>السعر</th>
                                        <th style={{ padding: "4px 8px", textAlign: "left", width: "20%" }}>الإجمالي</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {e.items.map((it: any, itIdx: number) => (
                                        <tr key={itIdx} style={{ borderBottom: itIdx < e.items.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                          <td style={{ padding: "4px 8px", fontWeight: "bold", color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.product_name}</td>
                                          <td style={{ padding: "4px 8px", textAlign: "center", fontFamily: "monospace", fontWeight: 900, color: "#0f172a" }}>{it.quantity}</td>
                                          <td style={{ padding: "4px 8px", textAlign: "left", fontFamily: "monospace", color: "#64748b", whiteSpace: "nowrap" }}>{formatEGP(it.unit_price)} ج</td>
                                          <td style={{ padding: "4px 8px", textAlign: "left", fontFamily: "monospace", fontWeight: "bold", color: "#0f172a", whiteSpace: "nowrap" }}>{formatEGP(it.line_total)} ج</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontWeight: "bold" }}>
                        لا توجد حركات مسجلة لهذا العميل
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs" style={{ borderTop: "1px solid #f1f5f9", color: "#64748b" }}>
              <span className="font-bold" style={{ color: "#334155" }}>شركة النسر للأدوات واللوحات الكهربائية</span>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>شكراً لتعاملكم معنا ▪ للإدارة والاستفسارات يرجى التواصل عبر الواتساب أو الهاتف</span>
            </div>
          </div>
        </div>

        {/* ── Actions Footer ───────────────────────────────────────────────── */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* WhatsApp Native Share */}
            <button
              type="button"
              onClick={handleShareWhatsapp}
              disabled={sharingWhatsapp}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 active:scale-95 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <span>{sharingWhatsapp ? "⏳" : "📲"}</span>
              <span>{sharingWhatsapp ? "جاري التجهيز..." : "إرسال واتساب"}</span>
            </button>

            {/* Download Image */}
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={downloadingImage}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 active:scale-95 text-white text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="تحميل صورة كشف الحساب"
            >
              <span>{downloadingImage ? "⏳" : "🖼️"}</span>
              <span>{downloadingImage ? "جاري..." : "صورة"}</span>
            </button>

            {/* Print Page */}
            <button
              type="button"
              onClick={handlePrint}
              className="bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="طباعة"
            >
              <span>🖨️</span>
              <span>طباعة</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            ✕ إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
