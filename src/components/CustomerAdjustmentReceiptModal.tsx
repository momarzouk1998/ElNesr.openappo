"use client";
import PaymentReceiptModal from "@/components/PaymentReceiptModal";

interface CustomerAdjustmentReceiptModalProps {
  adjustmentId: string;
  onClose: () => void;
}

export default function CustomerAdjustmentReceiptModal({
  adjustmentId,
  onClose,
}: CustomerAdjustmentReceiptModalProps) {
  return <PaymentReceiptModal adjustmentId={adjustmentId} onClose={onClose} />;
}
