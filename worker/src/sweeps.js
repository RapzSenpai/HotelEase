// Moved verbatim from src/index.js — hourly sweeps, no logic changes.
import { EXPIRY_SWEEP_MAX_PER_COLLECTION, ORPHAN_SWEEP_MAX_DELETES, STALE_TRAINING_GUEST_MAX, STALE_TRAINING_GUEST_MS } from "./config.js";
import { getGoogleAccessToken } from "./google-auth.js";
import {
  deleteAuthAccount,
  deleteFirestoreDoc,
  fsValue,
  getFirestoreDoc,
  listSubcollectionDocs,
  listSubcollectionIds,
  patchFirestoreDoc,
  runFirestoreQuery,
} from "./firestore.js";

// ===========================================================================
// Scheduled stale-hold sweep (Cloudflare Cron Triggers)
//
// The client-side checkAndExpireStaleBookings() only runs when staff load
// RoomsPage / FoBookingsPage — guests never trigger it and nothing else does.
// Abandoned "Awaiting Payment" holds would therefore keep their nights blocked
// in room_availability until a staff member happens to open a page. This cron
// cancels them server-side (hourly) and frees their availability markers.
//
// The same cron then runs sweepOrphanMarkers() to purge any marker a failed
// client-side cleanup left behind (see that function for the rationale).
// ===========================================================================

/**
 * Cancel Awaiting Payment bookings whose payment deadline has passed and free
 * their room_availability markers. Sweeps prod `bookings` + `training_bookings`.
 */
export async function expireStaleHolds(workerEnv) {
  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT not configured" };

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT is not valid JSON" };
  }
  if (!projectId) return { ok: false, reason: "project_id missing" };

  const accessToken = await getGoogleAccessToken(sa);
  const nowIso = new Date().toISOString();

  const summary = { expiredBookings: 0, releasedMarkers: 0, errors: 0 };

  // PROD holds live in `bookings` and block nights via `room_availability`
  // markers; training holds live in `training_bookings` and block nights via
  // `training_availability` markers (same claim protocol, sandbox collection).
  for (const [col, markerCol] of [["bookings", "room_availability"], ["training_bookings", "training_availability"]]) {
    try {
      const expired = await runFirestoreQuery(accessToken, projectId, col, {
        from: [{ collectionId: col }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "status" },
                  op: "EQUAL",
                  value: { stringValue: "Awaiting Payment" },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "paymentDeadline" },
                  op: "LESS_THAN",
                  value: { timestampValue: nowIso },
                },
              },
            ],
          },
        },
      });

      for (const booking of expired.slice(0, EXPIRY_SWEEP_MAX_PER_COLLECTION)) {
        const bookingId = booking.id;
        try {
          await patchFirestoreDoc(
            accessToken,
            projectId,
            col,
            bookingId,
            {
              status: { stringValue: "Cancelled" },
              rejectionReason: { stringValue: "Payment deadline expired" },
              updatedAt: { timestampValue: nowIso },
            },
            ["status", "rejectionReason", "updatedAt"],
            // Compare-and-swap: a guest payment committed between our query
            // and this write changes updateTime, the patch fails 412, and the
            // paid hold survives. Next hour's query won't match it anyway.
            booking.updateTime || null,
          );
          summary.expiredBookings += 1;

          // Release the availability markers tied to this hold.
          if (fsValue(booking.fields, "roomId")) {
            const markers = await runFirestoreQuery(accessToken, projectId, markerCol, {
              from: [{ collectionId: markerCol }],
              where: {
                fieldFilter: {
                  field: { fieldPath: "bookingId" },
                  op: "EQUAL",
                  value: { stringValue: bookingId },
                },
              },
            });
            for (const marker of markers) {
              try {
                await deleteFirestoreDoc(accessToken, projectId, `${markerCol}/${marker.id}`);
                summary.releasedMarkers += 1;
              } catch (e) {
                summary.errors += 1;
                console.error(`[sweep] marker delete failed ${marker.id}:`, String(e?.message || e));
              }
            }
          }
        } catch (e) {
          // 412 = precondition lost: someone (a guest payment) touched the
          // booking mid-sweep. Their write won — skip quietly, not an error.
          if (String(e?.message || e).includes("(412)")) {
            console.log(`[sweep] skipped ${col}/${bookingId}: changed mid-sweep`);
            continue;
          }
          summary.errors += 1;
          console.error(`[sweep] expiry failed for ${col}/${bookingId}:`, String(e?.message || e));
        }
      }
    } catch (e) {
      summary.errors += 1;
      console.error(`[sweep] query failed for ${col}:`, String(e?.message || e));
    }
  }

  return { ok: true, ...summary };
}

/**
 * Purge availability markers whose linked booking is terminal
 * (Cancelled / Checked Out) or missing entirely. Runs over both the prod
 * (`bookings` / `room_availability`) and training (`training_bookings` /
 * `training_availability`) pairs.
 *
 * Marker cleanup runs on the client AFTER the booking flips to a terminal
 * status. Before the marker delete rule allowed a guest to release
 * markers post-cancellation, that delete was denied and swallowed — leaving
 * "orphan" markers that permanently block their nights (guests saw the room as
 * unavailable and the calendar rendered a stale hold). Even with the rule
 * fixed, a dropped network request or an unhandled path can still leak a
 * marker, so this hourly sweep guarantees eventual consistency. "Cancellation
 * Requested" is still an active hold and is deliberately left alone.
 */
export async function sweepOrphanMarkers(workerEnv) {
  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT not configured" };

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT is not valid JSON" };
  }
  if (!projectId) return { ok: false, reason: "project_id missing" };

  const accessToken = await getGoogleAccessToken(sa);
  const summary = { markers: 0, orphansDeleted: 0, errors: 0 };

  const pairs = [["bookings", "room_availability"], ["training_bookings", "training_availability"]];
  const orphanIds = [];
  for (const [bookingCol, markerCol] of pairs) {
    let markers;
    try {
      markers = await runFirestoreQuery(accessToken, projectId, markerCol, {
        from: [{ collectionId: markerCol }],
      });
    } catch (e) {
      summary.errors += 1;
      console.error(`[sweep] marker scan failed for ${markerCol}:`, String(e?.message || e));
      continue;
    }
    summary.markers += markers.length;
    if (markers.length === 0) continue;

    // Group markers by the booking they reference. A marker with no bookingId
    // can never belong to an active booking, so it is an orphan by definition.
    const byBooking = new Map(); // bookingId -> markerId[]
    for (const marker of markers) {
      const bookingId = fsValue(marker.fields, "bookingId");
      if (!bookingId) {
        orphanIds.push(`${markerCol}/${marker.id}`);
        continue;
      }
      if (!byBooking.has(bookingId)) byBooking.set(bookingId, []);
      byBooking.get(bookingId).push(marker.id);
    }

    for (const [bookingId, markerIds] of byBooking) {
      let booking;
      try {
        booking = await getFirestoreDoc(accessToken, projectId, bookingCol, bookingId);
      } catch (e) {
        summary.errors += 1;
        console.error(`[sweep] booking lookup failed for ${bookingId}:`, String(e?.message || e));
        continue;
      }
      const status = booking.exists ? fsValue(booking.fields, "status") : null;
      const isOrphan =
        !booking.exists || status === "Cancelled" || status === "Checked Out";
      if (isOrphan) orphanIds.push(...markerIds.map((id) => `${markerCol}/${id}`));
    }
  }

  const targets = orphanIds.slice(0, ORPHAN_SWEEP_MAX_DELETES);
  const CONCURRENCY = 10;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    await Promise.all(
      targets.slice(i, i + CONCURRENCY).map(async (markerPath) => {
        try {
          await deleteFirestoreDoc(accessToken, projectId, markerPath);
          summary.orphansDeleted += 1;
        } catch (e) {
          summary.errors += 1;
          console.error(`[sweep] orphan marker delete failed ${markerPath}:`, String(e?.message || e));
        }
      }),
    );
  }

  if (orphanIds.length > targets.length) {
    console.warn(
      `[sweep] orphan deletion capped at ${ORPHAN_SWEEP_MAX_DELETES}; ` +
        `${orphanIds.length - targets.length} left for the next run`,
    );
  }

  return { ok: true, ...summary };
}

/**
 * Notification retention: per inbox, keep the latest INBOX_KEEP_COUNT items
 * newer than INBOX_KEEP_DAYS — delete an item when it is past EITHER bound
 * (whichever is more restrictive). Unread safety: an unread item is only
 * purged when it is past BOTH bounds (abandoned); read items go by either.
 * Current notifications and the unread badge (latest-20 bell) are unaffected
 * in practice — the bell only ever shows the newest items, which are kept.
 */
const INBOX_KEEP_COUNT = 200;
const INBOX_KEEP_DAYS = 90;
const INBOX_PAGE_SIZE = 400;
const INBOX_PAGE_FAILURE_RETRIES = 3;
// Per-run budgets; the active owner's page token persists separately from
// the completed-owner cursor so partial scans resume without skipping owners.
const INBOX_MAX_OWNERS_PER_RUN = 200;
const INBOX_MAX_PAGES_PER_RUN = 100;
const INBOX_MAX_DELETES_PER_RUN = 2000;
const INBOX_MAX_PAGES_PER_COLLECTION = INBOX_MAX_PAGES_PER_RUN / 2;
const INBOX_MAX_DELETES_PER_COLLECTION = INBOX_MAX_DELETES_PER_RUN / 2;
const INBOX_CURSOR_KEY = "inbox-retention-cursor";
const INBOX_PAGE_CURSOR_KEY = "inbox-retention-page-cursor";

function inboxRank(item, rank, ageCutoff) {
  const isRead = fsValue(item.fields, "isRead") === true;
  const createdRaw = fsValue(item.fields, "createdAt");
  const createdMs = createdRaw ? Date.parse(createdRaw) : NaN;
  const pastCount = rank > INBOX_KEEP_COUNT;
  // Missing createdAt: rank-only (never age-purge what we can't date).
  const pastAge = !Number.isNaN(createdMs) && createdMs < ageCutoff;
  return {
    purge: isRead ? (pastCount || pastAge) : (pastCount && pastAge),
  };
}

export async function purgeNotificationInboxes(workerEnv) {
  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT not configured" };

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT is not valid JSON" };
  }
  if (!projectId) return { ok: false, reason: "project_id missing" };

  const accessToken = await getGoogleAccessToken(sa);
  const now = Date.now();
  const ageCutoff = now - INBOX_KEEP_DAYS * 86400000;
  const summary = { ownersScanned: 0, pagesScanned: 0, kept: 0, purged: 0, errors: 0, resumed: false, completed: true };

  const kv = workerEnv.AI_LIMITS || null;
  async function readCursor(col) {
    try {
      return (await kv?.get(`${INBOX_CURSOR_KEY}:${col}`)) || "";
    } catch {
      return "";
    }
  }
  async function writeCursor(col, value) {
    try {
      if (!kv) return;
      if (value) await kv.put(`${INBOX_CURSOR_KEY}:${col}`, value);
      else await kv.delete(`${INBOX_CURSOR_KEY}:${col}`);
    } catch (e) {
      console.error("[sweep] inbox cursor persist failed:", String(e?.message || e));
    }
  }
  async function readPageCursor(col) {
    try {
      const raw = await kv?.get(`${INBOX_PAGE_CURSOR_KEY}:${col}`);
      const value = raw ? JSON.parse(raw) : null;
      if (
        value && typeof value.uid === "string" &&
        (value.stage === "ordered" || value.stage === "missing") &&
        typeof value.pageToken === "string" &&
        Number.isFinite(value.orderedSeen) &&
        Number.isFinite(Number(value.pageFailures ?? 0))
      ) return value;
    } catch {
      // A malformed or unavailable resume token restarts the active owner.
    }
    return null;
  }
  async function writePageCursor(col, value) {
    try {
      if (!kv) return;
      const key = `${INBOX_PAGE_CURSOR_KEY}:${col}`;
      if (value) await kv.put(key, JSON.stringify(value));
      else await kv.delete(key);
    } catch (e) {
      console.error("[sweep] inbox page cursor persist failed:", String(e?.message || e));
    }
  }

  for (const [inboxCol, ownerCol] of [["notifications", "users"], ["training_notifications", "training_guests"]]) {
    let pagesScanned = 0;
    let purged = 0;
    const lastDoneUid = await readCursor(ownerCol);
    const pageCursor = await readPageCursor(ownerCol);
    if (lastDoneUid || pageCursor) summary.resumed = true;
    let owners;
    try {
      owners = await runFirestoreQuery(accessToken, projectId, ownerCol, {
        from: [{ collectionId: ownerCol }],
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
        ...(lastDoneUid
          ? { startAt: { values: [{ referenceValue: `projects/${projectId}/databases/(default)/documents/${ownerCol}/${lastDoneUid}` }], before: false } }
          : {}),
        limit: INBOX_MAX_OWNERS_PER_RUN + 1,
      });
    } catch (e) {
      summary.errors += 1;
      console.error(`[sweep] inbox owners query failed ${ownerCol}:`, String(e?.message || e));
      continue;
    }

    let stoppedEarly = false;
    for (const owner of owners.slice(0, INBOX_MAX_OWNERS_PER_RUN)) {
      const uid = owner.id;
      if (!uid) continue;
      if (
        purged >= INBOX_MAX_DELETES_PER_COLLECTION ||
        pagesScanned >= INBOX_MAX_PAGES_PER_COLLECTION
      ) {
        stoppedEarly = true;
        break;
      }
      summary.ownersScanned += 1;
      let progress = pageCursor?.uid === uid
        ? { ...pageCursor, pageFailures: Number.isFinite(Number(pageCursor.pageFailures ?? 0)) ? Number(pageCursor.pageFailures) : 0 }
        : { uid, stage: "ordered", pageToken: "", orderedSeen: 0, pageFailures: 0 };
      let ownerFinished = false;
      try {
        for (;;) {
          if (
            purged >= INBOX_MAX_DELETES_PER_COLLECTION ||
            pagesScanned >= INBOX_MAX_PAGES_PER_COLLECTION
          ) break;
          const { docs, nextPageToken } = await listSubcollectionDocs(
            accessToken, projectId, `${inboxCol}/${uid}`, "items",
            {
              ...(progress.stage === "ordered" ? { orderBy: "createdAt desc" } : {}),
              pageSize: INBOX_PAGE_SIZE,
              pageToken: progress.pageToken,
            },
          );
          summary.pagesScanned += 1;
          pagesScanned += 1;
          let orderedSeen = progress.orderedSeen;
          let pageFinished = true;
          for (const item of docs) {
            if (purged >= INBOX_MAX_DELETES_PER_COLLECTION) {
              pageFinished = false;
              break;
            }
            const hasCreatedAt = fsValue(item.fields, "createdAt") !== undefined;
            let purge;
            if (progress.stage === "ordered") {
              orderedSeen += 1;
              purge = inboxRank(item, orderedSeen, ageCutoff).purge;
            } else {
              if (hasCreatedAt) continue;
              const isRead = fsValue(item.fields, "isRead") === true;
              purge = isRead && progress.orderedSeen >= INBOX_KEEP_COUNT;
            }
            if (purge) {
              try {
                await deleteFirestoreDoc(accessToken, projectId, `${inboxCol}/${uid}/items/${item.id}`);
                summary.purged += 1;
                purged += 1;
              } catch (e) {
                summary.errors += 1;
                console.error(`[sweep] inbox purge failed ${uid}/${item.id}:`, String(e?.message || e));
              }
            } else {
              summary.kept += 1;
            }
          }
          if (!pageFinished) break;

          progress.orderedSeen = orderedSeen;
          progress.pageFailures = 0;
          if (nextPageToken) {
            progress.pageToken = nextPageToken;
          } else if (progress.stage === "ordered") {
            progress.stage = "missing";
            progress.pageToken = "";
          } else {
            ownerFinished = true;
            break;
          }
          await writePageCursor(ownerCol, progress);
        }
      } catch (e) {
        summary.errors += 1;
        console.error(`[sweep] inbox scan failed ${uid}:`, String(e?.message || e));
        progress.pageFailures = (Number.isFinite(Number(progress.pageFailures ?? 0)) ? Number(progress.pageFailures) : 0) + 1;
        if (progress.stage === "ordered") {
          progress.orderedSeen = 0;
        }
        progress.pageToken = "";
        if (progress.pageFailures >= INBOX_PAGE_FAILURE_RETRIES) {
          await writePageCursor(ownerCol, null);
          await writeCursor(ownerCol, uid);
          ownerFinished = true;
        } else {
          await writePageCursor(ownerCol, progress);
        }
      }
      if (!ownerFinished) {
        await writePageCursor(ownerCol, progress);
        stoppedEarly = true;
        break;
      }
      await writePageCursor(ownerCol, null);
      await writeCursor(ownerCol, uid);
    }

    const moreOwners = owners.length > INBOX_MAX_OWNERS_PER_RUN || stoppedEarly;
    const collectionComplete = !moreOwners;
    summary.completed = summary.completed && collectionComplete;
    if (collectionComplete) {
      await writePageCursor(ownerCol, null);
      await writeCursor(ownerCol, "");
    }
  }

  return { ok: true, ...summary };
}

/**
 * Purge abandoned training sandbox accounts. Kicked / expired / tab-closed
 * trainees never run the logout cleanup, so their anonymous Auth accounts +
 * training_guests docs accumulate. Anything idle past STALE_TRAINING_GUEST_MS
 * (by document updateTime) is deleted: notification items, profile doc, then
 * the Auth account best-effort. A returning trainee just rejoins with the
 * session code — nothing production is touched.
 */
export async function sweepStaleTrainingGuests(workerEnv) {
  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT not configured" };

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT is not valid JSON" };
  }
  if (!projectId) return { ok: false, reason: "project_id missing" };

  const accessToken = await getGoogleAccessToken(sa);
  const summary = { scanned: 0, guestsDeleted: 0, authDeleted: 0, errors: 0 };

  let guests;
  try {
    guests = await runFirestoreQuery(accessToken, projectId, "training_guests", {
      from: [{ collectionId: "training_guests" }],
    });
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
  summary.scanned = guests.length;

  const cutoff = Date.now() - STALE_TRAINING_GUEST_MS;
  const stale = guests.filter((g) => {
    const updated = g.updateTime ? Date.parse(g.updateTime) : NaN;
    return Number.isNaN(updated) || updated < cutoff;
  }).slice(0, STALE_TRAINING_GUEST_MAX);

  for (const guest of stale) {
    try {
      for (const notifId of await listSubcollectionIds(accessToken, projectId, `training_notifications/${guest.id}`, "items")) {
        await deleteFirestoreDoc(accessToken, projectId, `training_notifications/${guest.id}/items/${notifId}`);
      }
      await deleteFirestoreDoc(accessToken, projectId, `training_guests/${guest.id}`);
      summary.guestsDeleted += 1;
      try {
        const authResult = await deleteAuthAccount(accessToken, projectId, guest.id);
        if (authResult === "deleted") summary.authDeleted += 1;
      } catch (authError) {
        summary.errors += 1;
        console.error(`[sweep] stale guest auth purge failed ${guest.id}:`, String(authError?.message || authError));
      }
    } catch (e) {
      summary.errors += 1;
      console.error(`[sweep] stale guest purge failed ${guest.id}:`, String(e?.message || e));
    }
  }

  return { ok: true, ...summary };
}
