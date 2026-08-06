import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

const ROOMS_COL = "rooms";

/**
 * Bulk update the status of multiple rooms in a single transactional batch.
 * @param {Object} params
 * @param {string[]} params.roomIds - List of room document IDs
 * @param {string} params.status - New status (e.g. 'Available', 'Out of Order')
 * @param {boolean} [params.trainingMode]
 * @returns {Promise<{ ok: boolean, updated: number }>}
 */
export async function bulkUpdateRoomStatus({ roomIds = [], status, trainingMode = null } = {}) {
  if (!status) throw new Error("A target status is required.");
  const ids = (Array.isArray(roomIds) ? roomIds : []).filter((id) => String(id || "").trim());

  const col = getCol(ROOMS_COL, trainingMode);
  const batch = writeBatch(db);

  ids.forEach((id) => {
    const ref = doc(db, col, id);
    batch.update(ref, {
      status,
      statusChangedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  if (ids.length > 0) await batch.commit();
  return { ok: true, updated: ids.length };
}

/**
 * Emergency override: force one room to a given status immediately.
 * Useful for mass cursor / availability resets during an outage or drill.
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.status
 * @param {string} [params.note]
 * @param {boolean} [params.trainingMode]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function emergencySetRoomStatus({ roomId, status, note = "", trainingMode = null } = {}) {
  if (!roomId) throw new Error("Room is required.");
  if (!status) throw new Error("A status is required.");
  const col = getCol(ROOMS_COL, trainingMode);
  const ref = doc(db, col, roomId);
  await updateDoc(ref, {
    status,
    emergencyOverride: true,
    emergencyNote: note,
    emergencyChangedAt: serverTimestamp(),
    statusChangedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

/**
 * Download a set of documents as a CSV file in the browser.
 * Not cached in Firestore — generated on demand from current data.
 * @param {string} filename
 * @param {Array<Object>} rows - Array of plain objects (col headers from first row keys)
 */
export function downloadDataCSV(filename, rows = []) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (cell) => {
    const s = String(cell ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fetch all rooms (used by export tooling). Reads live from Firestore.
 * @param {boolean} [trainingMode]
 * @returns {Promise<Array>}
 */
export async function exportRooms({ trainingMode = null } = {}) {
  const col = getCol(ROOMS_COL, trainingMode);
  const snap = await getDocs(query(collection(db, col)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch all users (used by export tooling).
 * @param {boolean} [trainingMode]
 * @returns {Promise<Array>}
 */
export async function exportUsers({ trainingMode = null } = {}) {
  const col = getCol("users", trainingMode);
  const snap = await getDocs(query(collection(db, col)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}