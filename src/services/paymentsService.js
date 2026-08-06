import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { generateReceipt } from "./receiptService";

function paymentsCollection(trainingMode) {
  return getCol("payments", trainingMode);
}

/**
 * Fetch all payment records for a given booking, sorted newest-first.
 *
 * NOTE: orderBy("createdAt") is intentionally omitted from the Firestore
 * query to avoid requiring a composite index on (bookingId + createdAt).
 * A missing composite index causes a silent FAILED_PRECONDITION error that
 * was previously swallowed by catch blocks, making Payment History always
 * appear empty even though the data existed in Firestore.
 * Sorting is done client-side instead.
 *
 * @param {string} bookingId
 * @param {{ trainingMode?: boolean|string|null }} options
 * @returns {Promise<Array<{ id: string, [key: string]: any }>>}
 */
export async function listPaymentsForBooking(
  bookingId,
  { trainingMode = null } = {},
) {
  if (!bookingId || typeof bookingId !== "string") {
    console.warn(
      "[paymentsService] listPaymentsForBooking: invalid bookingId",
      bookingId,
    );
    return [];
  }

  const col = paymentsCollection(trainingMode);

  const q = query(
    collection(db, col),
    where("bookingId", "==", bookingId),
    // No orderBy here — avoids the (bookingId, createdAt) composite index
    // requirement. Sorted client-side below.
  );

  const snap = await getDocs(q);

  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Sort newest-first by createdAt (handles both Firestore Timestamps and
  // plain objects/nulls gracefully).
  records.sort((a, b) => {
    const aMs = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
    const bMs = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
    return bMs - aMs;
  });

  return records;
}

/**
 * Record a payment against a booking.
 *
 * Atomically in a single Firestore transaction:
 *  1. Reads the current booking document to get the existing deposit amount.
 *  2. Creates a new document in the `payments` collection.
 *  3. Increments `booking.payment.deposit` by the payment amount.
 *
 * The top-level `note` field is ALWAYS persisted regardless of payment method
 * so that any free-text reference (GCash ref, check number, card digits,
 * cashier note, etc.) is retrievable and displayable without inspecting
 * method-specific sub-fields.
 *
 * @param {{
 *   bookingId: string,
 *   amount: number,
 *   method: string,
 *   note?: string | null,
 *   referenceNumber?: string | null,
 *   checkNumber?: string | null,
 *   bankName?: string | null,
 *   cardLast4?: string | null,
 *   trainingMode?: boolean | string | null,
 *   guestName?: string,
 *   guestEmail?: string,
 *   roomName?: string,
 *   roomType?: string,
 *   processedBy?: string,
 *   source?: string,
 * }} payload
 * @returns {Promise<{ id: string, newDeposit: number, receiptData: any }>}
 */
export async function recordPayment(payload) {
  const trainingMode = payload?.trainingMode ?? null;
  const bookingId = payload?.bookingId;
  const amount = Number(payload?.amount ?? 0);
  const method = String(payload?.method ?? "").trim();

  if (!bookingId || typeof bookingId !== "string")
    throw new Error("Invalid bookingId passed to recordPayment");
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Payment amount must be a positive number");
  if (!method) throw new Error("Payment method is required");

  // Unified note field — accepts both the new `note` key and the legacy
  // `referenceNumber` key so older callers continue to work.
  const note = payload?.note ?? payload?.referenceNumber ?? null;

  // Legacy per-method detail fields (kept for backward-compat with existing
  // records that were written before the `note` field was added).
  const referenceNumber = payload?.referenceNumber ?? null;
  const checkNumber = payload?.checkNumber ?? null;
  const bankName = payload?.bankName ?? null;
  const cardLast4 = payload?.cardLast4 ?? null;

  const bCol = getCol("bookings", trainingMode);
  const pCol = paymentsCollection(trainingMode);

  const receiptNo = "RCP-" + Date.now();

  return runTransaction(db, async (transaction) => {
    // ── Step 1: read (must precede all writes in a Firestore transaction) ──
    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);

    if (!bookingSnap.exists()) {
      throw new Error(
        `Booking "${bookingId}" not found in collection "${bCol}".`,
      );
    }

    const booking = bookingSnap.data();
    const existingDeposit = Number(booking?.payment?.deposit ?? 0);
    const totalCost = Number(booking?.totalCost ?? 0);
    const remainingBalance = totalCost - existingDeposit;

    if (amount > remainingBalance + 0.01) {
      throw new Error(
        `Payment of ₱${amount.toLocaleString()} exceeds the outstanding balance of ₱${remainingBalance.toLocaleString()}.`
      );
    }

    const newDeposit = existingDeposit + amount;

    // ── Step 2: build method-specific details (backward compatibility) ──
    const methodDetails = {};
    if (method === "GCash") {
      methodDetails.referenceNumber = referenceNumber ?? note ?? null;
    }
    if (method === "Check") {
      methodDetails.checkNumber = checkNumber ?? note ?? null;
      methodDetails.bankName = bankName ?? null;
    }
    if (method === "Credit Card") {
      methodDetails.cardLast4 = cardLast4 ?? note ?? null;
    }
    // For Cash (and any other method) methodDetails stays {} — the note is
    // captured in the top-level field written below.

    // ── Step 3: create the payment document ──
    const paymentRef = doc(collection(db, pCol));

    transaction.set(paymentRef, {
      bookingId,
      amount,
      method,
      // Top-level note: always written so any reference text is retrievable
      // regardless of payment method without inspecting methodDetails.
      note: note ?? null,
      // Method-specific structured details (retained for compatibility).
      methodDetails,
      receiptNo,
      receiptGeneratedAt: serverTimestamp(),
      processedBy: payload.processedBy || "Front Office Staff",
      source: payload.source || "fo_manual",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // ── Step 4: update the booking folio ──
    transaction.update(bookingRef, {
      "payment.deposit": newDeposit,
      "payment.method": method,
      updatedAt: serverTimestamp(),
    });

    console.log(
      `[paymentsService] transaction queued — paymentId: "${paymentRef.id}", newDeposit: ${newDeposit}`,
    );

    return {
      id: paymentRef.id,
      newDeposit,
      receiptData: {
        receiptNo,
        guestName: payload.guestName || booking.guestName || "Guest",
        guestEmail: payload.guestEmail || booking.guestEmail || "",
        roomName: payload.roomName || "Room",
        roomType: payload.roomType || "",
        checkIn: booking.checkInDate?.toDate?.() || booking.checkInDate,
        checkOut: booking.checkOutDate?.toDate?.() || booking.checkOutDate,
        numberOfNights: booking.nights,
        ratePerNight: booking.nights > 0 ? Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0))) / booking.nights : 0,
        baseTotal: Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0))),
        extraPaxCount: Number(booking.extraPaxCount ?? 0),
        extraPaxFee: Number(booking.extraPaxFee ?? 0),
        extraPaxTotal: Number(booking.extraPaxTotal ?? 0),
        total: booking.totalCost,
        subtotal: booking.totalCost,
        amountPaid: amount,
        balance: Math.max(0, booking.totalCost - newDeposit),
        paymentMethod: method,
        paymentDate: new Date(),
        processedBy: payload.processedBy || "Front Office Staff",
      },
    };
  });
}
