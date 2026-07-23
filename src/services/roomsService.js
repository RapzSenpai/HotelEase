/**
 * Firestore collections (from BSHM-PMS overview):
 * - `rooms`: room documents (type, status, rate, amenities, photos, ...)
 *
 * Phase 1: stubs only. Implement CRUD + status updates in Phase 2.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

const ROOMS_COL = "rooms";

export async function listRooms({ trainingMode = null } = {}) {
  const col = getCol(ROOMS_COL, trainingMode);
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getRoom(roomId, { trainingMode = null } = {}) {
  const col = getCol(ROOMS_COL, trainingMode);
  const ref = doc(db, col, roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Archived rooms are hidden from guests but remain in Firestore for booking history. */
export function isRoomActive(room) {
  return room?.isActive !== false;
}

/**
 * A room is bookable for future dates if it is active (not archived).
 * Date availability is determined by booking conflict checks, not today's
 * housekeeping/operational status (Occupied/Reserved/Dirty).
 */
export function isRoomBookable(room) {
  return isRoomActive(room);
}

/**
 * @param {object} payload
 * @param {string} payload.roomNumber
 * @param {string} payload.name
 * @param {string} payload.type  - Single Room | Suite Room | Presidential Room
 * @param {string} payload.status
 * @param {number} payload.ratePerNight
 * @param {string} payload.description
 * @param {string} payload.floor
 * @param {string[]} payload.amenities
 * @param {boolean} payload.trainingMode
 */
export async function createRoom(payload) {
  const trainingMode = payload?.trainingMode ?? null;
  const col = getCol(ROOMS_COL, trainingMode);
  const colRef = collection(db, col);
  const data = {
    roomNumber: payload.roomNumber ?? "",
    name: payload.name ?? "",
    type: payload.type ?? "Single Room",
    status: payload.status ?? "Available",
    ratePerNight: Number(payload.ratePerNight ?? 0),
    description: payload.description ?? "",
    floor: payload.floor ?? "",
    amenities: Array.isArray(payload.amenities) ? payload.amenities : [],
    // P0.2 — policy / facility fields
    policies: payload.policies ?? "",
    checkInTime: payload.checkInTime ?? "",
    checkOutTime: payload.checkOutTime ?? "",
    facilities: Array.isArray(payload.facilities) ? payload.facilities : [],
    photos: Array.isArray(payload.photos) ? payload.photos : [],
    isActive: payload.isActive ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(colRef, data);
  return { id: docRef.id };
}

export async function updateRoom(roomId, payload) {
  const trainingMode = payload?.trainingMode ?? null;
  const col = getCol(ROOMS_COL, trainingMode);
  const ref = doc(db, col, roomId);
  const data = {
    roomNumber: payload.roomNumber ?? "",
    name: payload.name ?? "",
    type: payload.type ?? "",
    status: payload.status ?? "",
    ratePerNight:
      payload.ratePerNight === undefined
        ? undefined
        : Number(payload.ratePerNight),
    description: payload.description ?? "",
    floor: payload.floor ?? "",
    amenities: Array.isArray(payload.amenities) ? payload.amenities : [],
    // P0.2 — policy / facility fields
    policies: payload.policies ?? "",
    checkInTime: payload.checkInTime ?? "",
    checkOutTime: payload.checkOutTime ?? "",
    facilities: Array.isArray(payload.facilities) ? payload.facilities : [],
    ...(Array.isArray(payload.photos) ? { photos: payload.photos } : {}),
    isActive: payload.isActive ?? true,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(ref, data);
  return { ok: true };
}

export async function deactivateRoom(roomId, { trainingMode = null } = {}) {
  const col = getCol(ROOMS_COL, trainingMode);
  const ref = doc(db, col, roomId);
  await updateDoc(ref, {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

export async function activateRoom(roomId, { trainingMode = null } = {}) {
  const col = getCol(ROOMS_COL, trainingMode);
  const ref = doc(db, col, roomId);
  await updateDoc(ref, {
    isActive: true,
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

export async function updateRoomRate(
  roomId,
  ratePerNight,
  { trainingMode = null } = {},
) {
  if (!roomId || typeof roomId !== "string") throw new Error("Invalid roomId");
  const col = getCol(ROOMS_COL, trainingMode);
  const ref = doc(db, col, roomId);
  await updateDoc(ref, {
    ratePerNight: Number(ratePerNight),
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

export function subscribeToRooms(callback, { trainingMode = null } = {}) {
  const col = getCol(ROOMS_COL, trainingMode);
  const q = query(collection(db, col));
  return onSnapshot(
    q,
    (snap) => {
      const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(rooms);
    },
    (error) => {
      console.error("[roomsService] subscribeToRooms error:", error);
      callback([]);
    }
  );
}
