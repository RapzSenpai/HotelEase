// Xendit TEST-mode gateway client (thin adapter over the Cloudflare Worker).
//
// The button side of BookingPaymentSection / BookingPage asks isXenditEnabled()
// and, when the flag is on, swaps the in-app simulated checkout page for
// Xendit's HOSTED test checkout:
//
//   createXenditInvoice({ bookingId })
//     → worker POST /xendit/invoice (guest's Firebase ID token in X-HE-AUTH)
//     → worker validates the booking server-side, creates the Xendit invoice,
//       stores its reference on the booking
//     → returns the hosted checkout URL; caller redirects the browser.
//
// Confirmation is SERVER-side only: the Worker's /xendit/webhook flips the
// booking to Pending. Returning to the app via the success redirect proves
// nothing by itself. Xendit secrets live exclusively in the Worker env.
//
// Flag: VITE_XENDIT_ENABLED=1 plus the existing VITE_GROQ_PROXY_URL (the
// Worker base URL) — nothing new to deploy for the simulated demo flow, which
// stays exactly as-is whenever the flag is absent.
import { auth } from "@/firebase/firebase.config";

export function isXenditEnabled() {
  return (
    import.meta.env.VITE_XENDIT_ENABLED === "1" &&
    Boolean(import.meta.env.VITE_GROQ_PROXY_URL)
  );
}

/**
 * Ask the Worker to create a Xendit test invoice for one booking.
 * Guards (owner / status / method / deadline / amount) run server-side; the
 * client only passes the booking id. Resolves { invoiceId, invoiceUrl }.
 */
export async function createXenditInvoice({ bookingId }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in before paying online.");

  const workerUrl = import.meta.env.VITE_GROQ_PROXY_URL?.replace(/\/+$/, "");
  if (!workerUrl) throw new Error("Online payment is not configured.");

  const token = await user.getIdToken();
  const response = await fetch(`${workerUrl}/xendit/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HE-AUTH": `Bearer ${token}`},
    body: JSON.stringify({ bookingId })});

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok || !result?.invoiceUrl) {
    throw new Error(
      result?.error ||
      "Could not start the payment. Please try again.");
  }
  return { invoiceId: result.invoiceId, invoiceUrl: result.invoiceUrl };
}
