import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/firebase/firebase.config";
// Shared with bookingsService — see lib/time-utils.js for the local-midnight rule.
import { toLocalDate as toDate } from "@/lib/time-utils";

/**
 * PII-free occupancy markers. PROD uses `room_availability`; training uses
 * `training_availability` (trainees are anonymous, and the prod markers deny
 * anonymous reads/writes — the sandbox mirror keeps the same guarantees with
 * sandbox-appropriate rules).
 *
 * Stored docs contain ONLY { roomId, date, bookingId, status } — no guest PII.
 * This lets guests check availability + render the room calendar without being
 * able to read other guests' bookings, while FO/admin maintain the source of
 * truth in `bookings`.
 *
 * Doc ID: `${roomId}_${date}` (date = YYYY-MM-DD).
 *
 * Markers are the double-booking lock: createBooking claims them inside a
 * transaction AFTER the booking doc commits, so two guests racing for the
 * same room/nights serialize — the loser sees the winner's markers on retry
 * and aborts. Never check-then-write markers outside a transaction.
 */
const A_COL = "room_availability";
const TRAINING_A_COL = "training_availability";

/** Marker collection for the given mode. */
export function markersCollection(trainingMode) {
  return trainingMode ? TRAINING_A_COL : A_COL;
}

// Statuses that count as "this marks the room occupied for that night".
export const ACTIVE_STATUSES = [
  "Awaiting Payment",
  "Pending",
  "Approved",
  "Checked In",
];

/**
 * True when a marker still holds its night: anything that isn't a swept
 * terminal state. Stale terminal markers are overwritable (the orphan sweeps
 * delete them eventually); live ones block.
 */
function isLiveMarkerStatus(status) {
  return status !== "Cancelled" && status !== "Checked Out";
}

/** Thrown when a marker claim loses a race — callers compensate, then rethrow. */
export const MARKER_CONFLICT_MESSAGE =
  "Those dates were just taken by another guest. Please choose different dates.";

export function dateKey(d) {
  const date = toDate(d);
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** YYYY-MM-DD keys for each night between check-in and check-out. */
export function nightKeys(checkInLike, checkOutLike) {
  const start = toDate(checkInLike);
  const end = toDate(checkOutLike);
  if (!start || !end) return [];
  const keys = [];
  const d = new Date(start);
  while (d < end) {
    keys.push(dateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

/** Block a booking's nights (call after a booking is created). */
export async function setBookingMarked({ roomId, bookingId, checkIn, checkOut, dates, status, trainingMode = null }) {
  const col = markersCollection(trainingMode);
  const markerDates = dates || nightKeys(checkIn, checkOut);
  await Promise.all(
    markerDates.map((date) =>
      setDoc(
        doc(db, col, `${roomId}_${date}`),
        {
          roomId,
          date,
          bookingId,
          status,
          updatedAt: serverTimestamp(),
        },
      ),
    ),
  );
}

export async function claimBookingMarkedInTx(transaction, {
  roomId,
  bookingId,
  checkIn,
  checkOut,
  status,
  trainingMode = null,
}) {
  const col = markersCollection(trainingMode);
  const dates = nightKeys(checkIn, checkOut);
  if (!roomId || !bookingId || dates.length === 0) {
    throw new Error("Missing booking details.");
  }

  const markerRefs = dates.map((date) => doc(db, col, `${roomId}_${date}`));
  const markerSnaps = [];
  for (const markerRef of markerRefs) {
    markerSnaps.push(await transaction.get(markerRef));
  }
  markerSnaps.forEach((markerSnap) => {
    if (markerSnap.exists()) {
      const marker = markerSnap.data();
      if (marker.bookingId !== bookingId && isLiveMarkerStatus(marker.status)) {
        throw new Error(MARKER_CONFLICT_MESSAGE);
      }
    }
  });
  dates.forEach((date, index) => {
    transaction.set(markerRefs[index], {
      roomId,
      date,
      bookingId,
      status,
      updatedAt: serverTimestamp(),
    });
  });
  return { claimed: dates.length };
}

/**
 * Ask the trusted Worker to atomically claim a booking's nights and queue its
 * notification job. Marker data is loaded and validated by the Worker.
 */
export async function claimBookingMarked({ bookingId, trainingMode = null }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in before claiming booking availability.");

  const workerUrl = import.meta.env.VITE_GROQ_PROXY_URL?.replace(/\/+$/, "");
  if (!workerUrl) throw new Error("Booking Worker service is not configured.");

  const token = await user.getIdToken();
  const response = await fetch(`${workerUrl}/claim-booking-markers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HE-AUTH": `Bearer ${token}`,
    },
    body: JSON.stringify({
      bookingId,
      trainingMode: trainingMode === true || trainingMode === "training",
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      result?.error ||
      (response.status === 409 ? MARKER_CONFLICT_MESSAGE : `Booking availability claim failed (${response.status}).`),
    );
    error.status = response.status;
    throw error;
  }
  if (result?.ok !== true || !Number.isInteger(result.claimed) || result.claimed < 0) {
    throw new Error("Booking availability service returned an invalid response.");
  }
  return { claimed: result.claimed };
}

/**
 * Read a booking's night markers inside a transaction. Used by approveBooking:
 * two overlapping bookings approved at once serialize on the booking docs,
 * and the loser sees the winner's live markers here and aborts.
 */
export async function readBookingMarkedInTx(transaction, { roomId, bookingId, checkIn, checkOut, trainingMode = null }) {
  const col = markersCollection(trainingMode);
  const dates = nightKeys(checkIn, checkOut);
  const live = [];
  for (const date of dates) {
    const markerSnap = await transaction.get(doc(db, col, `${roomId}_${date}`));
    if (!markerSnap.exists()) return { complete: false, live };
    const marker = markerSnap.data();
    if (marker.bookingId !== bookingId && isLiveMarkerStatus(marker.status)) {
      live.push({ date, bookingId: marker.bookingId, status: marker.status });
    }
  }
  return { complete: true, live };
}

/** Release a booking's nights (cancelled / rejected / checked out / expired). */
export async function clearBookingMarked({ roomId, bookingId, dates, trainingMode = null }) {
  if (!roomId || !bookingId || !Array.isArray(dates) || dates.length === 0) return;
  const col = markersCollection(trainingMode);
  await runTransaction(db, async (transaction) => {
    const markerRefs = dates.map((date) => doc(db, col, `${roomId}_${date}`));
    const markerSnaps = [];
    for (const markerRef of markerRefs) {
      markerSnaps.push(await transaction.get(markerRef));
    }
    markerSnaps.forEach((markerSnap, index) => {
      if (markerSnap.exists() && markerSnap.data().bookingId === bookingId) {
        transaction.delete(markerRefs[index]);
      }
    });
  });
}

/** Set of room IDs fully or partially blocked within [checkInStr, checkOutStr]. */
export async function getBlockedRoomIds(checkInLike, checkOutLike, { trainingMode = null } = {}) {
  const keyIn = dateKey(checkInLike);
  const keyOut = dateKey(checkOutLike);
  if (!keyIn || !keyOut) return new Set();

  // Markers are PII-free, so guests may read them in both modes. Reading
  // bookings directly would deny trainees with the guest role per rules.
  const q = query(
    collection(db, markersCollection(trainingMode)),
    where("date", ">=", keyIn),
    where("date", "<", keyOut),
  );
  const snap = await getDocs(q);
  return new Set(snap.docs.map((d) => d.data().roomId));
}

/** All blocked dates for a single room (used by the guest booking calendar). */
export async function getRoomAvailabilityCards(roomId, { trainingMode = null } = {}) {
  const q = query(collection(db, markersCollection(trainingMode)), where("roomId", "==", roomId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Live subscription to a single room's availability markers (guest booking
 * calendar). Guests can read room_availability, so this stays accurate when
 * other guests book or staff approve/cancel while the page is open.
 */
export function subscribeRoomAvailabilityCards(roomId, callback, { trainingMode = null } = {}) {
  const q = query(collection(db, markersCollection(trainingMode)), where("roomId", "==", roomId));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error("[availabilityService] subscribeRoomAvailabilityCards error:", error);
      callback([]);
    },
  );
}