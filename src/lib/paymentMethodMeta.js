import { Landmark, CreditCard, Store } from "lucide-react";
import gcashPng from "@/assets/gcash.png";

/**
 * Metadata for each supported payment method.
 * Icons use the existing gcash.png asset for GCash and lucide icons for the rest.
 */
export const PAYMENT_METHOD_META = {
  GCash: {
    icon: gcashPng,
    iconAlt: "GCash",
    description: "Pay via e-wallet and upload a screenshot as proof",
  },
  "Bank Transfer": {
    icon: Landmark,
    iconAlt: "Bank Transfer",
    description: "Transfer to our bank account and upload the receipt",
  },
  "Credit/Debit Card": {
    icon: CreditCard,
    iconAlt: "Credit/Debit Card",
    description: "Pay by card at the hotel front desk upon arrival",
  },
  "Over-the-Counter": {
    icon: Store,
    iconAlt: "Over-the-Counter",
    description: "Pay in cash at the hotel front desk upon arrival",
  },
};

export function getPaymentMethodMeta(method) {
  return PAYMENT_METHOD_META[method] ?? null;
}
