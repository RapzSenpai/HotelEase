import { getPaymentMethodMeta } from "@/lib/paymentMethodMeta";
import { cn } from "@/lib/utils";

/**
 * Renders the icon for a payment method — either the GCash brand image
 * or a lucide icon — at a consistent size across the UI.
 */
export default function PaymentMethodIcon({ method, className }) {
  const meta = getPaymentMethodMeta(method);
  if (!meta) return null;

  if (typeof meta.icon === "string") {
    return (
      <img
        src={meta.icon}
        alt={meta.iconAlt}
        aria-hidden="true"
        className={cn("h-6 w-6 shrink-0 rounded object-contain", className)}
      />
    );
  }

  const Icon = meta.icon;
  return (
    <Icon
      aria-hidden="true"
      className={cn("h-6 w-6 shrink-0 text-primary", className)}
    />
  );
}
