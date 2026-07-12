/**
 * Firestore service for the "testimonials" collection.
 *
 * Collection fields:
 *   guestId     (string)
 *   guestName   (string)
 *   rating      (number, 1-5)
 *   message     (string)
 *   status      ("Pending" | "Approved" | "Rejected")
 *   createdAt   (Timestamp)
 *   updatedAt   (Timestamp)
 *
 * NOT sandboxed — always writes to `testimonials` regardless of training mode.
 */

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";

const TESTIMONIALS_COL = "testimonials";

export async function createTestimonial({ guestId, guestName, rating, message }) {
  const cleanMessage = String(message ?? "").trim();
  const numRating = Number(rating);

  if (!guestId) throw new Error("Guest ID is required.");
  if (!Number.isFinite(numRating) || numRating < 1 || numRating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }
  if (!cleanMessage) throw new Error("Message is required.");

  const docRef = await addDoc(collection(db, TESTIMONIALS_COL), {
    guestId,
    guestName: guestName ?? "Guest",
    rating: numRating,
    message: cleanMessage,
    status: "Pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: docRef.id };
}

export async function listApprovedTestimonials() {
  const q = query(
    collection(db, TESTIMONIALS_COL),
    where("status", "==", "Approved"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAllTestimonials() {
  const q = query(
    collection(db, TESTIMONIALS_COL),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToApprovedTestimonials(callback) {
  const q = query(
    collection(db, TESTIMONIALS_COL),
    where("status", "==", "Approved"),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error("subscribeToApprovedTestimonials error:", error);
      callback([]);
    },
  );
}

export async function approveTestimonial(id) {
  if (!id) throw new Error("Testimonial ID is required.");
  await updateDoc(doc(db, TESTIMONIALS_COL, id), {
    status: "Approved",
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

export async function rejectTestimonial(id) {
  if (!id) throw new Error("Testimonial ID is required.");
  await updateDoc(doc(db, TESTIMONIALS_COL, id), {
    status: "Rejected",
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

export function subscribeToAllTestimonials(callback) {
  const q = query(
    collection(db, TESTIMONIALS_COL),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error("subscribeToAllTestimonials error:", error);
      callback([]);
    },
  );
}

