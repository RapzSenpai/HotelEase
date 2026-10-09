import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/firebase/firebase.config";
import { createNotification } from "../notificationService";
import { listFoUsers } from "../userService";
import { uploadImageToCloudinary } from "../cloudinaryService";
import { bookingsCollection } from "./core";

/**
 * Guest payment-proof upload: validates ownership and status, stores the image
 * and flips "Awaiting Payment" to "Pending", then tells the front office.
 * Moved from bookingsService without changes.
 */
export async function uploadPaymentProof(bookingId, file, paymentType, paymentMethod) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to uploadPaymentProof");
  }
  if (!file) {
    throw new Error("File is required for payment proof upload");
  }
  if (!paymentType || !["Full", "Partial"].includes(paymentType)) {
    throw new Error("paymentType must be 'Full' or 'Partial'");
  }
  if (!paymentMethod || !["GCash", "Bank Transfer", "Credit/Debit Card", "Over-the-Counter"].includes(paymentMethod)) {
    throw new Error("Invalid payment method");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to upload payment proof");
  }

  const col = bookingsCollection();
  const bookingRef = doc(db, col, bookingId);

  // Fast-path pre-check so an obviously stale booking never pays for an
  // upload; the transaction below is the real guard.
  const preSnap = await getDoc(bookingRef);
  if (!preSnap.exists()) {
    throw new Error("Booking not found");
  }
  if (preSnap.data().status !== "Awaiting Payment") {
    throw new Error("Payment proof can only be uploaded for bookings in 'Awaiting Payment' status");
  }

  const { url } = await uploadImageToCloudinary(file, { compressionPreset: "paymentProofs" });

  // Transaction: parallel uploads serialize on the booking doc — the loser
  // re-reads status (now Pending) and aborts. Its image is already uploaded
  // (ponytail: no upload dedup — a wasted image beats a double-flip; add an
  // idempotency key when Cloudinary spend matters).
  await runTransaction(db, async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);

    if (!bookingSnap.exists()) {
      throw new Error("Booking not found");
    }

    const booking = bookingSnap.data();
    if (booking.guestId !== currentUser.uid) {
      throw new Error("You can only upload payment proof for your own bookings");
    }
    if (booking.status !== "Awaiting Payment") {
      throw new Error("Payment proof can only be uploaded for bookings in 'Awaiting Payment' status");
    }

    transaction.update(bookingRef, {
      paymentProofUrl: url,
      paymentType: paymentType,
      paymentMethod: paymentMethod,
      proofUploadedAt: serverTimestamp(),
      status: "Pending",
      updatedAt: serverTimestamp()});
  });

  try {
    const foUsers = await listFoUsers().then(users =>
      users.filter(u => u.id !== currentUser.uid)
    );

    await Promise.all(foUsers.map(fo => createNotification(fo.id, {
      type: "payment_proof_uploaded",
      title: "Payment Proof Uploaded",
      message: `Payment proof has been uploaded for a booking request`,
      link: "/fo/bookings"
    })));
  } catch (e) {
    console.error("Notif error", e);
  }

  return { ok: true, paymentProofUrl: url };
}
