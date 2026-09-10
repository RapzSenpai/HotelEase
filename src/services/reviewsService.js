/**
 * Firestore service for the "reviews" collection.
 *
 * Collection fields:
 *   roomId      (string)
 *   bookingId   (string)
 *   guestId     (string)
 *   guestName   (string)
 *   rating      (number, 1-5)
 *   feedback    (string)
 *   createdAt   (Timestamp)
 *   updatedAt   (Timestamp)
 *
 * NOTE: In training mode, getCol("reviews", trainingMode) resolves to
 * "training_reviews" via db-utils sandboxing.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

const BASE_COL = "reviews";

function reviewsCollection(trainingMode) {
  return getCol(BASE_COL, trainingMode);
}

/**
 * Fetch all reviews for a given room, ordered newest-first.
 *
 * @param {string} roomId
 * @param {{ trainingMode?: boolean|string|null }} options
 * @returns {Promise<Array<{ id: string, [key: string]: any }>>}
 */
export async function listReviewsForRoom(roomId, { trainingMode = null } = {}) {
  if (!roomId) return [];
  const col = reviewsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("roomId", "==", roomId),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Submit a new review document to Firestore.
 *
 * One review per guest per room is enforced by using a deterministic doc id
 * (`${guestId}_${roomId}`) plus a transactional existence check, so a guest
 * cannot spam duplicates even from DevTools.
 *
 * @param {{
 *   roomId: string,
 *   bookingId: string,
 *   guestId: string,
 *   guestName: string,
 *   rating: number,
 *   feedback: string,
 *   trainingMode?: boolean|string|null
 * }} payload
 * @returns {Promise<{ id: string }>}
 */
export async function createReview(payload) {
  const {
    roomId,
    bookingId,
    guestId,
    guestName,
    rating,
    feedback,
    trainingMode = null,
  } = payload;

  if (!roomId || !guestId) {
    throw new Error("createReview: roomId and guestId are required.");
  }

  // Belt-and-braces: also catch legacy reviews created before deterministic ids.
  const already = await hasUserReviewedRoom(guestId, roomId, { trainingMode });
  if (already) {
    throw new Error("You have already reviewed this room.");
  }

  const col = reviewsCollection(trainingMode);
  const reviewId = `${guestId}_${roomId}`;
  const reviewRef = doc(db, col, reviewId);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reviewRef);
    if (existing.exists()) {
      throw new Error("You have already reviewed this room.");
    }
    transaction.set(reviewRef, {
      roomId: roomId ?? "",
      bookingId: bookingId ?? "",
      guestId: guestId ?? "",
      guestName: guestName ?? "Guest",
      rating: Number(rating ?? 1),
      feedback: feedback ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return { id: reviewId };
}

/**
 * Check whether a guest has already reviewed a specific room.
 *
 * Fast path: deterministic doc id. Fallback: query for legacy reviews created
 * before the deterministic-id scheme existed.
 *
 * @param {string} guestId
 * @param {string} roomId
 * @param {{ trainingMode?: boolean|string|null }} options
 * @returns {Promise<boolean>}
 */
export async function hasUserReviewedRoom(guestId, roomId, { trainingMode = null } = {}) {
  if (!guestId || !roomId) return false;

  const col = reviewsCollection(trainingMode);
  try {
    const snap = await getDoc(doc(db, col, `${guestId}_${roomId}`));
    if (snap.exists()) return true;
  } catch {
    // fall through to the legacy query
  }

  const q = query(
    collection(db, col),
    where("guestId", "==", guestId),
    where("roomId", "==", roomId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}
