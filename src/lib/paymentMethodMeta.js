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
    description: "Pay online in the next step",
  },
  "Bank Transfer": {
    icon: Landmark,
    iconAlt: "Bank Transfer",
    description: "Pay online in the next step",
  },
  "Credit/Debit Card": {
    icon: CreditCard,
    iconAlt: "Credit/Debit Card",
    description: "Pay by card at the front desk",
  },
  "Over-the-Counter": {
    icon: Store,
    iconAlt: "Over-the-Counter",
    description: "Pay cash at the front desk",
  },
};

export function getPaymentMethodMeta(method) {
  return PAYMENT_METHOD_META[method] ?? null;
}
