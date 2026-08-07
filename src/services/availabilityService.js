import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";

/**
 * Public "room_availability" collection (PROD only — training keeps reading
 * the wide-open training_bookings sandbox).
 *
 * Stored docs contain ONLY { roomId, date, bookingId, status } — no guest PII.
 * This lets guests check availability + render the room calendar without being
 * able to read other guests' bookings, while FO/admin maintain the source of
 * truth in `bookings`.
 *
 * Doc ID: `${roomId}_${date}` (date = YYYY-MM-DD).
 */
const A_COL = "room_availability";

// Statuses that count as "this marks the room occupied for that night".
export const ACTIVE_STATUSES = [
  "Awaiting Payment",
  "Pending",
  "Approved",
  "Checked In",
];

function toDate(dateLike) {
  if (!dateLike) return null;
  if (dateLike instanceof Date) return dateLike;
  if (typeof dateLike === "string") return new Date(`${dateLike}T00:00:00`);
  if (typeof dateLike.toDate === "function") return dateLike.toDate();
  return null;
}

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
export async function setBookingMarked({ roomId, bookingId, checkIn, checkOut, status }) {
  const dates = nightKeys(checkIn, checkOut);
  await Promise.all(
    dates.map((date) =>
      setDoc(
        doc(db, A_COL, `${roomId}_${date}`),
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

/** Release a booking's nights (cancelled / rejected / checked out / expired). */
export async function clearBookingMarked({ roomId, dates }) {
  if (!roomId || !Array.isArray(dates) || dates.length === 0) return;
  await Promise.all(
    dates.map((date) => deleteDoc(doc(db, A_COL, `${roomId}_${date}`))),
  );
}

/** Set of room IDs fully or partially blocked within [checkInStr, checkOutStr]. */
export async function getBlockedRoomIds(checkInLike, checkOutLike) {
  const keyIn = dateKey(checkInLike);
  const keyOut = dateKey(checkOutLike);
  if (!keyIn || !keyOut) return new Set();

  const q = query(
    collection(db, A_COL),
    where("date", ">=", keyIn),
    where("date", "<", keyOut),
  );
  const snap = await getDocs(q);
  return new Set(snap.docs.map((d) => d.data().roomId));
}

/** All blocked dates for a single room (used by the guest booking calendar). */
export async function getRoomAvailabilityCards(roomId) {
  const q = query(collection(db, A_COL), where("roomId", "==", roomId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}