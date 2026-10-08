import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { listFoUsers } from "./userService";
import { createNotification } from "./notificationService";
import { PROOF_REQUIRED_METHODS } from "@/lib/paymentDetails";

/**
 * Simulated payment gateway (sandbox provider).
 *
 * No real money moves and no external API is called — this module mimics the
 * checkout flow of GCash / Bank Transfer inside the system so the booking →
 * payment → receipt lifecycle can complete end-to-end. It sits behind the
 * same shape a real gateway adapter would use (initiate → confirm →
 * reference number), so production integration (e.g. PayMongo test mode)
 * can be added later without touching the UI.
 *
 * Firestore rules whitelist the exact field set written here — update both
 * together (see bookings update rule, "SIMULATED gateway payment").
 */

// Unambiguous alphabet (no 0/O, 1/I) so reference numbers read cleanly aloud.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRefToken(length = 4) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

/**
 * Generate a gateway-style reference number, e.g. "HE-GC-0906-7K2M".
 * @param {string} method - 'GCash' | 'Bank Transfer'
 * @returns {string}
 */
export function generateGatewayRef(method) {
  const prefix = method === "Bank Transfer" ? "BT" : "GC";
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `HE-${prefix}-${mmdd}-${randomRefToken()}`;
}

/**
 * Complete a simulated payment for a booking. Mirrors the guards of
 * uploadPaymentProof (owner-only, Awaiting Payment only) but writes gateway
 * fields instead of proof fields, per the rules whitelist.
 *
 * @param {Object} params
 * @param {string} params.bookingId
 * @param {string|null} [params.trainingMode]
 * @param {string} [params.userBankRef] - required for Bank Transfer, typed from banking app
 * @returns {Promise<{ ok: boolean, gatewayRef: string, bankRef?: string }>}
 */
export async function completeSimulatedPayment({ bookingId, trainingMode = null, userBankRef } = {}) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to completeSimulatedPayment");
  }
  const trimmedBankRef = typeof userBankRef === "string" ? userBankRef.trim() : "";

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to complete a payment");
  }

  const col = getCol("bookings", trainingMode);
  const bookingRef = doc(db, col, bookingId);

  // Transaction: double-clicks / double-tabs serialize on the booking doc —
  // the loser re-reads status (now Pending) and aborts instead of writing a
  // second gatewayRef. Also loses cleanly to the expiry sweep (Cancelled).
  const { booking, gatewayRef, bankRef } = await runTransaction(db, async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);

    if (!bookingSnap.exists()) {
      throw new Error("Booking not found");
    }

    const data = bookingSnap.data();
    if (data.guestId !== currentUser.uid) {
      throw new Error("You can only pay for your own bookings");
    }
    if (data.status !== "Awaiting Payment") {
      throw new Error("Payment can only be completed for bookings in 'Awaiting Payment' status");
    }
    if (!PROOF_REQUIRED_METHODS.includes(data.paymentMethod)) {
      throw new Error("This booking method does not use the online checkout");
    }
    if (data.paymentMethod === "Bank Transfer" && (trimmedBankRef.length < 4 || trimmedBankRef.length > 32)) {
      throw new Error("Enter a demo reference, 4 to 32 characters.");
    }

    const ref = generateGatewayRef(data.paymentMethod);
    const update = {
      paymentGateway: "simulated",
      gatewayRef: ref,
      paidAt: serverTimestamp(),
      status: "Pending",
      updatedAt: serverTimestamp(),
    };
    let storedBankRef = null;
    if (data.paymentMethod === "Bank Transfer") {
      storedBankRef = trimmedBankRef;
      update.bankRef = storedBankRef;
    }
    transaction.update(bookingRef, update);
    return { booking: data, gatewayRef: ref, bankRef: storedBankRef };
  });

  // Same FO fan-out notification the proof-upload path sends.
  try {
    const foUsers = await listFoUsers({ trainingMode }).then((users) =>
      users.filter((u) => u.id !== currentUser.uid),
    );

    await Promise.all(
      foUsers.map((fo) =>
        createNotification(fo.id, {
          type: "payment_received",
          title: "Payment Received (Simulated)",
          message: `Simulated ${booking.paymentMethod} payment completed for a booking request`,
          link: "/fo/bookings",
        }, { trainingMode }),
      ),
    );
  } catch (e) {
    console.error("Notif error", e);
  }

  return { ok: true, gatewayRef, bankRef };
}
