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
import { cloudinaryConfig } from "@/cloudinary/cloudinary.config";
import { compressImage } from "@/lib/imageCompression";
import { listUsers } from "./userService";
import { createNotification } from "./notificationService";

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
export async function createAnnouncement(payload) {
  const title = String(payload?.title ?? "").trim();
  const description = String(payload?.description ?? "").trim();
  const date = parseDateToTimestamp(payload?.date);

  if (!title) throw new Error("Announcement title is required.");
  if (!description) throw new Error("Announcement description is required.");
  if (!date) throw new Error("Announcement date is required.");

  const docRef = doc(collection(db, ANNOUNCEMENTS_COL));

  let imageUrl = payload?.imageUrl || null;
  if (!imageUrl && payload?.imageFile) {
    const file = await compressImage(payload.imageFile, "announcementImages");
    if (!cloudinaryConfig?.cloudName || !cloudinaryConfig?.uploadPreset) {
      throw new Error("Cloudinary is not configured. Please set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", cloudinaryConfig.uploadPreset);
    // Keep a stable folder per Firestore doc to mirror the previous Storage layout.
    formData.append("folder", `announcements/${docRef.id}`);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      throw new Error(`Cloudinary upload failed: ${text || uploadRes.status}`);
    }

    const data = await uploadRes.json();
    imageUrl = data?.secure_url || data?.url || null;

    if (!imageUrl) {
      throw new Error("Cloudinary upload succeeded but no URL was returned.");
    }
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
    // Notify all guests
    const allUsers = await listUsers(); // no training mode for announcements based on the file scope
    const guestUsers = allUsers.filter(u => u.role === "guest");
    await Promise.all(guestUsers.map(guest => createNotification(guest.id, {
      type: "announcement",
      title: "New Announcement 📢",
      message: title,
      link: "/"
    })));
  } catch(e) { console.error("Notif error", e); }

  return { id: docRef.id };
}

export async function updateAnnouncement(id, payload) {
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

export async function deleteAnnouncement(id) {
  if (!id) throw new Error("Announcement ID is required.");
  const docRef = doc(db, ANNOUNCEMENTS_COL, id);
  await deleteDoc(docRef);
  return { ok: true };
}

