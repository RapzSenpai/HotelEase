import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

const ROOMS_COL = "rooms";

/**
 * Bulk update the status of multiple rooms in a single transactional batch.
 * @param {Object} params
 * @param {string[]} params.roomIds - List of room document IDs
 * @param {string} params.status - New status (e.g. 'Available', 'Out of Order')
 * @returns {Promise<{ ok: boolean, updated: number }>}
 */
export async function bulkUpdateRoomStatus({ roomIds = [], status } = {}) {
  if (!status) throw new Error("A target status is required.");
  const ids = (Array.isArray(roomIds) ? roomIds : []).filter((id) => String(id || "").trim());

  const col = getCol(ROOMS_COL);
  const batch = writeBatch(db);

  ids.forEach((id) => {
    const ref = doc(db, col, id);
    batch.update(ref, {
      status,
      statusChangedAt: serverTimestamp(),
      updatedAt: serverTimestamp()});
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
 * @returns {Promise<{ ok: boolean }>}
 */
export async function emergencySetRoomStatus({ roomId, status, note = "" } = {}) {
  if (!roomId) throw new Error("Room is required.");
  if (!status) throw new Error("A status is required.");
  const col = getCol(ROOMS_COL);
  const ref = doc(db, col, roomId);
  await updateDoc(ref, {
    status,
    emergencyOverride: true,
    emergencyNote: note,
    emergencyChangedAt: serverTimestamp(),
    statusChangedAt: serverTimestamp(),
    updatedAt: serverTimestamp()});
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
 * Safety cap for CSV exports: a bounded window instead of the whole
 * collection, so a large dataset can't freeze the tab or spike the bill.
 * Callers must surface `truncated` + `total` to the user (see onExport).
 */
export const EXPORT_MAX_ROWS = 5000;

async function exportWindow(col, { maxRows = EXPORT_MAX_ROWS, excludeId = null } = {}) {
  const ref = collection(db, col);
  const filters = excludeId ? [where(documentId(), "!=", excludeId)] : [];
  const totalSnap = await getCountFromServer(query(ref, ...filters));
  const total = totalSnap.data().count;
  const snap = await getDocs(query(ref, ...filters, orderBy(documentId()), limit(maxRows)));
  return {
    docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    total,
    truncated: total > snap.docs.length};
}

/**
 * Fetch rooms for export tooling (capped window). Reads live from Firestore.
 */
export async function exportRooms({ maxRows = EXPORT_MAX_ROWS } = {}) {
  const { docs, total, truncated } = await exportWindow(getCol(ROOMS_COL), { maxRows });
  return { rows: docs, total, truncated };
}

/**
 * Fetch users for export tooling (capped window, system doc excluded before
 * the cap so it can never displace a real user — or skew the total — at the
 * window boundary.
 */
export async function exportUsers({ maxRows = EXPORT_MAX_ROWS } = {}) {
  const col = getCol("users");
  const { docs, total, truncated } = await exportWindow(col, { maxRows, excludeId: "system" });
  return {
    rows: docs,
    total,
    truncated};
}