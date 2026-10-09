import { getGoogleAccessToken } from "./google-auth.js";
import {
  beginFirestoreTransaction,
  commitFirestoreTransaction,
  createFirestoreDoc,
  fsValue,
  getFirestoreDoc,
  getFirestoreDocInTransaction,
  patchFirestoreDoc,
  rollbackFirestoreTransaction,
  runFirestoreQuery,
} from "./firestore.js";

const JOB_BATCH_SIZE = 50;
const WAITING_JOB_AGE_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const PROOF_REQUIRED_METHODS = ["GCash", "Bank Transfer"];
const TERMINAL_BOOKING_STATUSES = ["Cancelled", "Rejected", "Expired", "Checked Out"];
const ACTIVE_BOOKING_STATUSES = ["Awaiting Payment", "Pending", "Approved", "Checked In"];

function firestoreString(value) {
  return { stringValue: String(value) };
}

function firestoreInteger(value) {
  return { integerValue: String(value) };
}

function firestoreDocumentPath(projectId, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `projects/${projectId}/databases/(default)/documents/${encodedPath}`;
}

function markerDatesFromFields(fields) {
  const values = fields?.markerDates?.arrayValue?.values;
  if (!Array.isArray(values)) return null;
  return values.map((value) => value?.stringValue);
}

function validMarkerDates(dates, nights) {
  if (!Array.isArray(dates) || dates.length !== nights || dates.length === 0) return false;
  if (!dates.every((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return false;
  }
  if (new Set(dates).size !== dates.length) return false;
  return dates.every((date, index) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
    if (index === 0) return true;
    const previous = new Date(`${dates[index - 1]}T00:00:00.000Z`);
    previous.setUTCDate(previous.getUTCDate() + 1);
    return previous.toISOString().slice(0, 10) === date;
  });
}

function markerDatesMatchBooking(dates, bookingFields, nights) {
  if (!validMarkerDates(dates, nights)) return false;
  const checkIn = fsValue(bookingFields, "checkInDate");
  const checkOut = fsValue(bookingFields, "checkOutDate");
  if (!checkIn || !checkOut) return false;
  const checkInTimestamp = new Date(checkIn);
  const checkOutTimestamp = new Date(checkOut);
  if (
    Number.isNaN(checkInTimestamp.getTime()) ||
    Number.isNaN(checkOutTimestamp.getTime())
  ) return false;
  const dayMs = 24 * 60 * 60 * 1000;
  const dayNumber = (date) => Math.floor(Date.parse(`${date}T00:00:00.000Z`) / dayMs);
  const markerStartDay = dayNumber(dates[0]);
  const markerCheckoutDay = dayNumber(dates[dates.length - 1]) + 1;

  // Booking timestamps are local midnights, while the Worker runs in UTC.
  // Find a plausible guest UTC offset; allow a one-hour boundary shift for DST.
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 1) {
    const localCheckInDay = Math.floor((checkInTimestamp.getTime() + offsetMinutes * 60_000) / dayMs);
    if (localCheckInDay !== markerStartDay) continue;
    const localCheckOutDay = Math.floor((checkOutTimestamp.getTime() + offsetMinutes * 60_000) / dayMs);
    if (Math.abs(localCheckOutDay - markerCheckoutDay) <= 1) return true;
  }
  return false;
}

function isLiveMarker(fields, bookingId) {
  const markerBookingId = fsValue(fields, "bookingId");
  const status = fsValue(fields, "status");
  return markerBookingId !== bookingId && !["Cancelled", "Checked Out"].includes(status);
}

function markerWrite(projectId, markerCollection, roomId, date, bookingId, status) {
  const path = `${markerCollection}/${roomId}_${date}`;
  return {
    update: {
      name: firestoreDocumentPath(projectId, path),
      fields: {
        roomId: firestoreString(roomId),
        date: firestoreString(date),
        bookingId: firestoreString(bookingId),
        status: firestoreString(status),
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    },
    updateMask: { fieldPaths: ["roomId", "date", "bookingId", "status", "updatedAt"] },
  };
}

function queueJobWrite(projectId, jobCollection, bookingId) {
  return {
    update: {
      name: firestoreDocumentPath(projectId, `${jobCollection}/${bookingId}`),
      fields: { status: firestoreString("queued") },
    },
    updateMask: { fieldPaths: ["status"] },
  };
}

/**
 * Claim every booking night and queue its notification job in one server-owned
 * Firestore transaction. The caller UID is optional for scheduled recovery.
 */
async function claimBookingNotificationJobOnce({
  accessToken,
  projectId,
  bookingId,
  requesterUid = null,
}) {
  if (typeof bookingId !== "string" || !bookingId) {
    throw new Error("Invalid booking marker claim request.");
  }
  const bookingCollection = "bookings";
  const jobCollection = "booking_notification_jobs";
  const markerCollection = "room_availability";
  const transaction = await beginFirestoreTransaction(accessToken, projectId);
  let transactionOpen = true;
  const rollback = async () => {
    if (!transactionOpen) return;
    transactionOpen = false;
    await rollbackFirestoreTransaction(accessToken, projectId, transaction);
  };

  try {
    const booking = await getFirestoreDocInTransaction(
      accessToken, projectId, `${bookingCollection}/${bookingId}`, transaction,
    );
    const job = await getFirestoreDocInTransaction(
      accessToken, projectId, `${jobCollection}/${bookingId}`, transaction,
    );
    if (!booking.exists || !job.exists) {
      await rollback();
      return { status: "cancelled", claimedMarkers: 0 };
    }

    const guestId = fsValue(job.fields, "guestId");
    if (
      fsValue(job.fields, "bookingId") !== bookingId ||
      fsValue(booking.fields, "guestId") !== guestId ||
      fsValue(job.fields, "roomId") !== fsValue(booking.fields, "roomId") ||
      fsValue(job.fields, "paymentMethod") !== fsValue(booking.fields, "paymentMethod") ||
      (requesterUid && requesterUid !== guestId)
    ) {
      await rollback();
      return { status: "cancelled", claimedMarkers: 0 };
    }

    const dates = markerDatesFromFields(job.fields);
    const nights = fsValue(booking.fields, "nights");
    if (!markerDatesMatchBooking(dates, booking.fields, nights)) {
      await rollback();
      return { status: "conflict", claimedMarkers: 0 };
    }

    if (fsValue(job.fields, "status") === "queued") {
      await rollback();
      return { status: "queued", claimedMarkers: dates.length };
    }
    if (
      fsValue(job.fields, "status") !== "waiting_for_markers" ||
      !ACTIVE_BOOKING_STATUSES.includes(fsValue(booking.fields, "status"))
    ) {
      await rollback();
      return { status: "cancelled", claimedMarkers: 0 };
    }

    const roomId = fsValue(job.fields, "roomId");
    const markerDocs = [];
    for (const date of dates) {
      markerDocs.push(await getFirestoreDocInTransaction(
        accessToken,
        projectId,
        `${markerCollection}/${roomId}_${date}`,
        transaction,
      ));
    }
    if (markerDocs.some((marker) => marker.exists && isLiveMarker(marker.fields, bookingId))) {
      await rollback();
      return { status: "conflict", claimedMarkers: 0 };
    }

    const status = fsValue(booking.fields, "status");
    const writes = [
      ...dates.map((date) =>
        markerWrite(projectId, markerCollection, roomId, date, bookingId, status),
      ),
      queueJobWrite(projectId, jobCollection, bookingId),
    ];
    await commitFirestoreTransaction(accessToken, projectId, transaction, writes);
    transactionOpen = false;
    return { status: "queued", claimedMarkers: dates.length };
  } catch (error) {
    if (transactionOpen) {
      await rollback();
    }
    throw error;
  }
}

export async function claimBookingNotificationJob(input) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await claimBookingNotificationJobOnce(input);
    } catch (error) {
      if (error?.status !== 409 || attempt >= 2) throw error;
    }
  }
}

function timestampFilter(fieldPath, op, iso) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op,
      value: { timestampValue: iso },
    },
  };
}

function statusFilter(status) {
  return {
    fieldFilter: {
      field: { fieldPath: "status" },
      op: "EQUAL",
      value: { stringValue: status },
    },
  };
}

async function listDueJobs(accessToken, projectId, collectionId, status, nowIso) {
  const filters = [
    statusFilter(status),
    timestampFilter("nextAttemptAt", "LESS_THAN_OR_EQUAL", nowIso),
  ];
  const jobs = await runFirestoreQuery(accessToken, projectId, collectionId, {
    from: [{ collectionId }],
    where: { compositeFilter: { op: "AND", filters } },
    orderBy: [{
      field: { fieldPath: "nextAttemptAt" },
      direction: "ASCENDING",
    }],
    limit: JOB_BATCH_SIZE,
  });
  return jobs.slice(0, JOB_BATCH_SIZE);
}

async function listStaleWaitingJobs(accessToken, projectId, collectionId) {
  const cutoff = new Date(Date.now() - WAITING_JOB_AGE_MS).toISOString();
  const jobs = await runFirestoreQuery(accessToken, projectId, collectionId, {
    from: [{ collectionId }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          statusFilter("waiting_for_markers"),
          timestampFilter("createdAt", "LESS_THAN_OR_EQUAL", cutoff),
        ],
      },
    },
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
    limit: JOB_BATCH_SIZE,
  });
  return jobs.slice(0, JOB_BATCH_SIZE);
}

function decodeJob(job) {
  return {
    id: job.id,
    bookingId: fsValue(job.fields, "bookingId") || job.id,
    guestId: fsValue(job.fields, "guestId"),
    roomId: fsValue(job.fields, "roomId"),
    roomName: fsValue(job.fields, "roomName") || "Room",
    checkIn: fsValue(job.fields, "checkIn") || "",
    checkOut: fsValue(job.fields, "checkOut") || "",
    paymentMethod: fsValue(job.fields, "paymentMethod") || "",
    attempts: Number(fsValue(job.fields, "attempts") || 0),
    createdAt: fsValue(job.fields, "createdAt"),
    nextAttemptAt: fsValue(job.fields, "nextAttemptAt"),
  };
}

async function patchJob(accessToken, projectId, collectionId, jobId, fields) {
  await patchFirestoreDoc(accessToken, projectId, collectionId, jobId, fields, Object.keys(fields));
}

async function findRecipients(accessToken, projectId, userCollection) {
  const users = await runFirestoreQuery(accessToken, projectId, userCollection, {
    from: [{ collectionId: userCollection }],
    where: {
      fieldFilter: {
        field: { fieldPath: "role" },
        op: "EQUAL",
        value: { stringValue: "fo" },
      },
    },
  });
  return users
    .filter((user) => user.id)
    .map((user) => ({
      id: user.id,
      guestName: fsValue(user.fields, "fullName") || fsValue(user.fields, "email") || "Guest",
    }));
}

async function retryJob(accessToken, projectId, collectionId, job, error, now) {
  const attempts = job.attempts + 1;
  const backoffMs = Math.min(60_000 * (2 ** (attempts - 1)), MAX_BACKOFF_MS);
  const nextAttemptAt = new Date(now.getTime() + backoffMs).toISOString();
  const message = String(error?.message || error).slice(0, 500);
  await patchJob(accessToken, projectId, collectionId, job.id, {
    attempts: firestoreInteger(attempts),
    lastError: firestoreString(message),
    nextAttemptAt: { timestampValue: nextAttemptAt },
    updatedAt: { timestampValue: now.toISOString() },
  });
}

async function cancelStaleWaitingJob(accessToken, projectId, collectionId, job, bookingCollection, now) {
  const createdAt = Date.parse(job.createdAt || "");
  if (!Number.isFinite(createdAt) || now.getTime() - createdAt < WAITING_JOB_AGE_MS) return false;

  const transaction = await beginFirestoreTransaction(accessToken, projectId);
  let transactionOpen = true;
  const rollback = async () => {
    if (!transactionOpen) return;
    transactionOpen = false;
    await rollbackFirestoreTransaction(accessToken, projectId, transaction);
  };
  try {
    const booking = await getFirestoreDocInTransaction(
      accessToken, projectId, `${bookingCollection}/${job.bookingId}`, transaction,
    );
    const currentJob = await getFirestoreDocInTransaction(
      accessToken, projectId, `${collectionId}/${job.id}`, transaction,
    );
    if (
      !currentJob.exists ||
      fsValue(currentJob.fields, "status") !== "waiting_for_markers" ||
      (booking.exists && !TERMINAL_BOOKING_STATUSES.includes(fsValue(booking.fields, "status")))
    ) {
      await rollback();
      return false;
    }

    await commitFirestoreTransaction(accessToken, projectId, transaction, [{
      update: {
        name: firestoreDocumentPath(projectId, `${collectionId}/${job.id}`),
        fields: {
          status: firestoreString("cancelled"),
          updatedAt: { timestampValue: now.toISOString() },
        },
      },
      updateMask: { fieldPaths: ["status", "updatedAt"] },
    }]);
    transactionOpen = false;
    return true;
  } catch (error) {
    if (transactionOpen) await rollback();
    throw error;
  }
}

async function compensateMarkerConflict(
  accessToken,
  projectId,
  collectionId,
  job,
  bookingCollection,
  now,
) {
  const transaction = await beginFirestoreTransaction(accessToken, projectId);
  let transactionOpen = true;
  const rollback = async () => {
    if (!transactionOpen) return;
    transactionOpen = false;
    await rollbackFirestoreTransaction(accessToken, projectId, transaction);
  };
  try {
    const booking = await getFirestoreDocInTransaction(
      accessToken, projectId, `${bookingCollection}/${job.bookingId}`, transaction,
    );
    const currentJob = await getFirestoreDocInTransaction(
      accessToken, projectId, `${collectionId}/${job.id}`, transaction,
    );
    if (!currentJob.exists || fsValue(currentJob.fields, "status") !== "waiting_for_markers") {
      await rollback();
      return false;
    }

    const writes = [{
      update: {
        name: firestoreDocumentPath(projectId, `${collectionId}/${job.id}`),
        fields: {
          status: firestoreString("cancelled"),
          updatedAt: { timestampValue: now.toISOString() },
        },
      },
      updateMask: { fieldPaths: ["status", "updatedAt"] },
    }];
    if (booking.exists && ACTIVE_BOOKING_STATUSES.includes(fsValue(booking.fields, "status"))) {
      writes.push({
        update: {
          name: firestoreDocumentPath(projectId, `${bookingCollection}/${job.bookingId}`),
          fields: {
            status: firestoreString("Cancelled"),
            rejectionReason: firestoreString("Dates taken by an earlier booking."),
            updatedAt: { timestampValue: now.toISOString() },
          },
        },
        updateMask: { fieldPaths: ["status", "rejectionReason", "updatedAt"] },
      });
    }
    await commitFirestoreTransaction(accessToken, projectId, transaction, writes);
    transactionOpen = false;
    return true;
  } catch (error) {
    if (transactionOpen) await rollback();
    throw error;
  }
}

async function deliverJob(accessToken, projectId, collectionId, job, userCollection, now) {
  const recipients = await findRecipients(accessToken, projectId, userCollection);
  const staffRecipients = recipients.filter((recipient) => recipient.id !== job.guestId);
  const guest = await getFirestoreDoc(accessToken, projectId, userCollection, job.guestId);
  const guestName = guest.exists
    ? fsValue(guest.fields, "fullName") || fsValue(guest.fields, "email") || "Guest"
    : "Guest";
  const notifications = staffRecipients.map((recipient) => ({
    recipientId: recipient.id,
    type: "booking_request",
    title: "New Booking Request",
    message: `${guestName} requested ${job.roomName} from ${job.checkIn} to ${job.checkOut}`,
    link: "/fo/bookings",
  }));

  if (PROOF_REQUIRED_METHODS.includes(job.paymentMethod) && job.guestId) {
    notifications.push({
      recipientId: job.guestId,
      type: "payment_proof_required",
      title: "Payment Proof Required",
      message: `Upload payment proof to complete your booking for ${job.roomName}`,
      link: "/my-bookings",
    });
  }

  for (const notification of notifications) {
    const documentId = `booking_${job.bookingId}_${notification.recipientId}_${notification.type}`;
    await createFirestoreDoc(
      accessToken,
      projectId,
      `notifications/${notification.recipientId}/items`,
      documentId,
      {
        id: firestoreString(documentId),
        type: firestoreString(notification.type),
        title: firestoreString(notification.title),
        message: firestoreString(notification.message),
        link: firestoreString(notification.link),
        isRead: { booleanValue: false },
        createdAt: { timestampValue: now.toISOString() },
      },
    );
  }

  await patchJob(accessToken, projectId, collectionId, job.id, {
    status: firestoreString("delivered"),
    updatedAt: { timestampValue: now.toISOString() },
    deliveredAt: { timestampValue: now.toISOString() },
  });
}

async function recordJobFailure(summary, accessToken, projectId, collectionId, job, error, now) {
  summary.errors += 1;
  try {
    await retryJob(accessToken, projectId, collectionId, job, error, now);
    summary.retried += 1;
  } catch (retryError) {
    summary.errors += 1;
    console.error(
      `[booking-notifications] retry state write failed for ${collectionId}/${job.id} attempt ${job.attempts + 1}:`,
      String(retryError?.message || retryError),
    );
  }
  console.error(
    `[booking-notifications] processing failed for ${collectionId}/${job.id} attempt ${job.attempts + 1}:`,
    String(error?.message || error),
  );
}

/**
 * Best-effort immediate fan-out for one queued job. Called from the
 * /claim-booking-markers request path so FO inboxes update without waiting
 * for the next cron tick. Throws on failure — the caller leaves the job
 * queued and the scheduled sweep retries it. Notification document IDs are
 * deterministic, so a concurrent cron delivery cannot duplicate toasts.
 */
export async function deliverQueuedJob({ accessToken, projectId, bookingId }) {
  const collectionId = "booking_notification_jobs";
  const userCollection = "users";
  const job = await getFirestoreDoc(accessToken, projectId, collectionId, bookingId);
  if (!job.exists || fsValue(job.fields, "status") !== "queued") {
    return { delivered: false };
  }
  // getFirestoreDoc carries no id — the job doc id is the booking id.
  await deliverJob(accessToken, projectId, collectionId, decodeJob({ ...job, id: bookingId }), userCollection, new Date());
  return { delivered: true };
}

export async function processBookingNotificationOutbox(workerEnv) {
  const serviceAccount = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT not configured" };

  let projectId;
  try {
    projectId = JSON.parse(serviceAccount).project_id;
  } catch {
    return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT is not valid JSON" };
  }
  if (!projectId) return { ok: false, reason: "project_id missing" };

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const summary = { ok: true, delivered: 0, cancelled: 0, retried: 0, errors: 0 };
  const now = new Date();
  const nowIso = now.toISOString();

  for (const [collectionId, bookingCollection, userCollection] of [
    ["booking_notification_jobs", "bookings", "users"],
  ]) {
    let waitingJobs = [];
    let staleWaitingJobs = [];
    let queuedJobs = [];
    try {
      [waitingJobs, staleWaitingJobs, queuedJobs] = await Promise.all([
        listDueJobs(accessToken, projectId, collectionId, "waiting_for_markers", nowIso),
        listStaleWaitingJobs(accessToken, projectId, collectionId),
        listDueJobs(accessToken, projectId, collectionId, "queued", nowIso),
      ]);
    } catch (error) {
      summary.errors += 1;
      console.error(`[booking-notifications] query failed for ${collectionId}:`, String(error?.message || error));
      continue;
    }

    const waitingById = new Map();
    for (const rawJob of [...waitingJobs, ...staleWaitingJobs]) {
      waitingById.set(rawJob.id, decodeJob(rawJob));
    }
    const waiting = [...waitingById.values()]
      .sort((a, b) => (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0))
      .slice(0, JOB_BATCH_SIZE);

    for (const job of waiting) {
      try {
        if (
          await cancelStaleWaitingJob(
            accessToken, projectId, collectionId, job, bookingCollection, now,
          )
        ) {
          summary.cancelled += 1;
          continue;
        }
        const nextAttemptAt = Date.parse(job.nextAttemptAt || "");
        if (Number.isFinite(nextAttemptAt) && nextAttemptAt > now.getTime()) continue;

        const result = await claimBookingNotificationJob({
          accessToken,
          projectId,
          bookingId: job.bookingId,
        });
        if (result.status === "conflict") {
          if (await compensateMarkerConflict(
            accessToken,
            projectId,
            collectionId,
            job,
            bookingCollection,
            now,
          )) {
            summary.cancelled += 1;
          }
          continue;
        }
        if (result.status !== "queued") continue;

        await deliverJob(accessToken, projectId, collectionId, job, userCollection, now);
        summary.delivered += 1;
      } catch (error) {
        await recordJobFailure(summary, accessToken, projectId, collectionId, job, error, now);
      }
    }

    for (const rawJob of queuedJobs) {
      const job = decodeJob(rawJob);
      try {
        await deliverJob(accessToken, projectId, collectionId, job, userCollection, now);
        summary.delivered += 1;
      } catch (error) {
        await recordJobFailure(summary, accessToken, projectId, collectionId, job, error, now);
      }
    }
  }
  return summary;
}
