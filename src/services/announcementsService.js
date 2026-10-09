/**
 * Firestore collections (from BSHM-PMS overview):
 * - `announcements`: event/announcement posts
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { uploadImageToCloudinary } from "./cloudinaryService";
import { listGuests } from "./userService";
import { createNotificationsBulk } from "./notificationService";

const ANNOUNCEMENTS_COL = "announcements";

function parseDateToTimestamp(dateLike) {
  if (!dateLike) return null;
  if (dateLike instanceof Timestamp) return dateLike;
  if (dateLike.toDate) return Timestamp.fromDate(dateLike.toDate());
  if (typeof dateLike === "string") {
    // Expect YYYY-MM-DD from <input type="date" />
    const d = new Date(`${dateLike}T00:00:00`);
    return Timestamp.fromDate(d);
  }
  return null;
}

export async function listAnnouncements({ limitCount = 6 } = {}) {
  const q = query(
    collection(db, ANNOUNCEMENTS_COL),
    orderBy("date", "desc"),
    limit(Number(limitCount) || 6)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * @param {object} payload
 * @param {string} payload.title
 * @param {string} payload.description
 * @param {string} payload.date - YYYY-MM-DD
 * @param {File=} payload.imageFile - optional
 */
// Announcements are production-only. The training sandbox is gone, so the
// mode always resolves to production and this guard never fires.
function blockTrainingWrites(trainingMode) {
  // Match getCol: an omitted mode falls back to the training override.
  let mode = trainingMode;
  if (mode === null || mode === undefined) {
    mode = false;
  }
  if (mode === true || mode === "training") {
    throw new Error("Announcements are turned off in training mode.");
  }
}

export async function createAnnouncement(payload, { trainingMode = null } = {}) {
  blockTrainingWrites(trainingMode);
  const title = String(payload?.title ?? "").trim();
  const description = String(payload?.description ?? "").trim();
  const date = parseDateToTimestamp(payload?.date);

  if (!title) throw new Error("Announcement title is required.");
  if (!description) throw new Error("Announcement description is required.");
  if (!date) throw new Error("Announcement date is required.");

  const docRef = doc(collection(db, ANNOUNCEMENTS_COL));

  let imageUrl = payload?.imageUrl || null;
  if (!imageUrl && payload?.imageFile) {
    const { url } = await uploadImageToCloudinary(payload.imageFile, {
      compressionPreset: "announcementImages",
    });
    imageUrl = url;
  }

  await setDoc(docRef, {
    title,
    description,
    date,
    imageUrl,
    status: "Published",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    // Notify all guests — batched commits instead of N individual writes.
    // Same recipient set as before (role === "guest"), same payload.
    const guestUsers = await listGuests({ trainingMode });
    const result = await createNotificationsBulk(
      guestUsers.map((guest) => ({
        userId: guest.id,
        type: "announcement",
        title: "New Announcement 📢",
        message: title,
        link: "/",
      })),
      { trainingMode },
    );
    // Partial fan-out must not pass silently: the announcement itself is
    // already created, so report (don't throw) — staff can resend if needed.
    if (result.failed > 0) {
      console.error(
        `[announcements] fan-out partial failure: ${result.failed}/${guestUsers.length} notifications failed.`,
        result.errors,
      );
    }
  } catch(e) { console.error("Notif error", e); }

  return { id: docRef.id };
}

export async function updateAnnouncement(id, payload, { trainingMode = null } = {}) {
  blockTrainingWrites(trainingMode);
  if (!id) throw new Error("Announcement ID is required.");
  const docRef = doc(db, ANNOUNCEMENTS_COL, id);
  
  const updateData = {
    updatedAt: serverTimestamp(),
  };
  
  if (payload.title !== undefined) updateData.title = String(payload.title).trim();
  if (payload.description !== undefined) updateData.description = String(payload.description).trim();
  if (payload.date !== undefined) updateData.date = parseDateToTimestamp(payload.date);
  if (Object.prototype.hasOwnProperty.call(payload, "imageUrl")) {
    updateData.imageUrl = payload.imageUrl || null;
  }
  if (payload.status !== undefined) updateData.status = payload.status;

  await updateDoc(docRef, updateData);
  return { ok: true };
}

export async function deleteAnnouncement(id, { trainingMode = null } = {}) {
  blockTrainingWrites(trainingMode);
  if (!id) throw new Error("Announcement ID is required.");
  const docRef = doc(db, ANNOUNCEMENTS_COL, id);
  await deleteDoc(docRef);
  return { ok: true };
}

