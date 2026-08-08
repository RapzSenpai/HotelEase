/**
 * Firestore collections (from BSHM-PMS overview):
 * - training_bookings: mirror of `bookings` for training mode
 * - training_guests: mirror of `users` for training mode
 *
 * Phase 6: training mode toggle, session code, and training data reset.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
const SYSTEM_DOC_REF = doc(db, "users", "system");

const TRAINING_BOOKINGS_COL = "training_bookings";
const TRAINING_GUESTS_COL = "training_guests";
const TRAINING_PAYMENTS_COL = "training_payments";
const TRAINING_HOUSEKEEPING_LOGS_COL = "training_housekeeping_logs";
const TRAINING_ROOMS_COL = "training_rooms";
const TRAINING_REVIEWS_COL = "training_reviews";

function generateSessionCode() {
  // Short human-friendly code; collisions are extremely unlikely for a class project.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function getTrainingSystemState() {
  const snap = await getDoc(SYSTEM_DOC_REF);
  if (!snap.exists()) {
    return {
      enabled: false,
      sessionCode: null,
      sessionExpiry: null,
      sessionExpiryIso: null,
      updatedAt: null,
    };
  }

  const data = snap.data();
  return {
    enabled: Boolean(data?.enabled),
    sessionCode: data?.sessionCode ?? null,
    sessionExpiry: data?.sessionExpiry ?? null,
    sessionExpiryIso: data?.sessionExpiryIso ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
}

export async function setTrainingModeEnabled(enabled) {
  const next = Boolean(enabled);
  const patch = {
    enabled: next,
    updatedAt: serverTimestamp(),
  };
  // Closing training mode also closes any active session code so students
  // can no longer join while the mode is disabled.
  if (!next) {
    patch.sessionCode = null;
    patch.sessionExpiry = null;
    patch.sessionExpiryIso = null;
  }
  await setDoc(SYSTEM_DOC_REF, patch, { merge: true });
  return { ok: true };
}

/**
 * Creates/overwrites the active training session code + expiry.
 *
 * @param {object} payload
 * @param {number} payload.ttlHours
 */
export async function generateTrainingSessionCode({ ttlHours = 24 } = {}) {
  const hours = Number(ttlHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Invalid ttlHours for session code.");
  }

  const sessionCode = generateSessionCode();
  const expiry = new Date(Date.now() + hours * 60 * 60 * 1000);
  await setDoc(
    SYSTEM_DOC_REF,
    {
      enabled: true,
      sessionCode,
      sessionExpiry: serverTimestamp(), // placeholder until server clock isn't required
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Store expiry also as client date string so we can validate deterministically on frontend.
      sessionExpiryIso: expiry.toISOString(),
    },
    { merge: true }
  );

  return { sessionCode, expiryIso: expiry.toISOString() };
}

export async function validateTrainingSessionCode(code) {
  const raw = String(code ?? "").trim();
  if (!raw) return { ok: false, reason: "Session code is required." };

  const state = await getTrainingSystemState();
  if (!state.enabled) return { ok: false, reason: "Training mode is not enabled." };
  if (!state.sessionCode) return { ok: false, reason: "No active session code." };
  if (raw !== state.sessionCode) return { ok: false, reason: "Invalid session code." };

  // Validate against ISO string to avoid relying on Timestamp equality.
  const sysSnap = await getDoc(SYSTEM_DOC_REF);
  const iso = sysSnap.data()?.sessionExpiryIso;
  if (!iso) return { ok: false, reason: "Session expiry is missing." };

  const expiry = new Date(iso);
  if (Number.isNaN(expiry.getTime())) return { ok: false, reason: "Invalid session expiry." };
  if (Date.now() > expiry.getTime()) return { ok: false, reason: "Session code has expired." };

  return { ok: true };
}

async function clearCollection(colName) {
  const qSnap = await getDocs(collection(db, colName));
  const deletions = qSnap.docs.map((d) => deleteDoc(doc(db, colName, d.id)));
  await Promise.all(deletions);
}

export async function resetTrainingData() {
  // Notification cleanup is a best-effort nicety. Rules only allow a user to
  // read/write their own notifications subcollection, so when an admin (or a
  // different training uid) resets, these may be denied. Never let that
  // failure block the actual collection wipe below.
  try {
    const guestsSnap = await getDocs(collection(db, TRAINING_GUESTS_COL));
    const notifDeletions = guestsSnap.docs.map(async (d) => {
      const notifsSnap = await getDocs(collection(db, "notifications", d.id, "items"));
      const delPromises = notifsSnap.docs.map(n => deleteDoc(doc(db, "notifications", d.id, "items", n.id)));
      return Promise.all(delPromises);
    });
    await Promise.all(notifDeletions);
  } catch (e) {
    console.warn("[trainingService] Notification cleanup skipped:", e);
  }

  await Promise.all([
    clearCollection(TRAINING_BOOKINGS_COL),
    clearCollection(TRAINING_GUESTS_COL),
    clearCollection(TRAINING_PAYMENTS_COL),
    clearCollection(TRAINING_HOUSEKEEPING_LOGS_COL),
    clearCollection(TRAINING_ROOMS_COL),
    clearCollection(TRAINING_REVIEWS_COL),
  ]);
  return { ok: true };
}



