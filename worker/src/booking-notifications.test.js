import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(),
  createFirestoreDoc: vi.fn(),
  beginFirestoreTransaction: vi.fn(),
  getFirestoreDocInTransaction: vi.fn(),
  commitFirestoreTransaction: vi.fn(),
  rollbackFirestoreTransaction: vi.fn(),
  getFirestoreDoc: vi.fn(),
  patchFirestoreDoc: vi.fn(),
  runFirestoreQuery: vi.fn(),
  queuedJobs: {},
  waitingJobs: {},
  staff: {},
}));

vi.mock("./google-auth.js", () => ({
  getGoogleAccessToken: mocks.getGoogleAccessToken,
}));
vi.mock("./firestore.js", () => ({
  beginFirestoreTransaction: mocks.beginFirestoreTransaction,
  commitFirestoreTransaction: mocks.commitFirestoreTransaction,
  createFirestoreDoc: mocks.createFirestoreDoc,
  fsValue: (fields, key) => {
    const value = fields?.[key];
    if (value?.stringValue !== undefined) return value.stringValue;
    if (value?.timestampValue !== undefined) return value.timestampValue;
    if (value?.integerValue !== undefined) return Number(value.integerValue);
    return undefined;
  },
  getFirestoreDoc: mocks.getFirestoreDoc,
  getFirestoreDocInTransaction: mocks.getFirestoreDocInTransaction,
  patchFirestoreDoc: mocks.patchFirestoreDoc,
  rollbackFirestoreTransaction: mocks.rollbackFirestoreTransaction,
  runFirestoreQuery: mocks.runFirestoreQuery,
}));

import {
  claimBookingNotificationJob,
  deliverQueuedJob,
  processBookingNotificationOutbox,
} from "./booking-notifications.js";

const WORKER_ENV = {
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "test-project" }),
};

function field(value) {
  if (typeof value === "number") return { integerValue: String(value) };
  return { stringValue: String(value) };
}

function claimField(value) {
  if (typeof value === "number") return { integerValue: String(value) };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((entry) => ({ stringValue: entry })) } };
  }
  return { stringValue: String(value) };
}

function claimFields(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, claimField(value)]));
}

function setClaimDocuments({
  bookingId = "booking-claim",
  jobStatus = "waiting_for_markers",
  bookingStatus = "Pending",
  guestId = "guest-1",
  roomId = "room-1",
  paymentMethod = "GCash",
  markerDates = ["2026-10-01", "2026-10-02"],
  marker = null,
} = {}) {
  const bookingCollection = "bookings";
  const jobCollection = "booking_notification_jobs";
  const markerCollection = "room_availability";
  mocks.transactionDocuments = {
    ...mocks.transactionDocuments,
    [`${bookingCollection}/${bookingId}`]: {
      exists: true,
      fields: claimFields({
        guestId,
        roomId,
        status: bookingStatus,
        nights: markerDates.length,
        paymentMethod,
        checkInDate: "2026-10-01T00:00:00.000Z",
        checkOutDate: "2026-10-03T00:00:00.000Z",
      }),
      updateTime: "booking-update",
    },
    [`${jobCollection}/${bookingId}`]: {
      exists: true,
      fields: claimFields({
        bookingId,
        guestId,
        roomId,
        paymentMethod,
        status: jobStatus,
        markerDates,
      }),
      updateTime: "job-update",
    },
    [`${markerCollection}/${roomId}_${markerDates[0]}`]: marker || { exists: false, fields: {} },
    ...Object.fromEntries(markerDates.slice(1).map((date) => [
      `${markerCollection}/${roomId}_${date}`,
      { exists: false, fields: {} },
    ])),
  };
  mocks.getFirestoreDocInTransaction.mockImplementation(async (_token, _project, path, transaction) => {
    expect(transaction).toBeTruthy();
    return mocks.transactionDocuments[path] || { exists: false, fields: {} };
  });
}

function makeJob(id, overrides = {}) {
  const data = {
    bookingId: id,
    guestId: "guest-1",
    roomId: "room-1",
    roomName: "Deluxe Suite",
    checkIn: "10/1/2026",
    checkOut: "10/3/2026",
    paymentMethod: "GCash",
    status: "queued",
    attempts: 0,
    ...overrides,
  };
  return { id, fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])) };
}

function queryFilter(query, fieldPath) {
  return query.where?.fieldFilter?.field?.fieldPath === fieldPath
    ? query.where.fieldFilter
    : query.where?.compositeFilter?.filters?.find(
    (filter) => filter.fieldFilter?.field?.fieldPath === fieldPath,
  )?.fieldFilter;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queuedJobs = {};
  mocks.waitingJobs = {};
  mocks.staff = {};
  mocks.getGoogleAccessToken.mockResolvedValue("access-token");
  mocks.beginFirestoreTransaction.mockResolvedValue("transaction-1");
  mocks.commitFirestoreTransaction.mockResolvedValue(undefined);
  mocks.rollbackFirestoreTransaction.mockResolvedValue(undefined);
  mocks.transactionDocuments = {};
  mocks.runFirestoreQuery.mockImplementation(async (_token, _project, collectionId, query) => {
    const status = queryFilter(query, "status")?.value?.stringValue;
    if (status === "queued") return mocks.queuedJobs[collectionId] || [];
    if (status === "waiting_for_markers") return mocks.waitingJobs[collectionId] || [];
    if (queryFilter(query, "role")?.value?.stringValue === "fo") {
      return mocks.staff[collectionId] || [];
    }
    return [];
  });
  mocks.getFirestoreDoc.mockResolvedValue({
    exists: true,
    fields: { fullName: { stringValue: "Ava Guest" }, email: { stringValue: "ava@example.com" } },
  });
  mocks.createFirestoreDoc.mockResolvedValue(true);
  mocks.patchFirestoreDoc.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("booking notification outbox", () => {
  it("atomically claims every marker and queues the owned waiting job", async () => {
    setClaimDocuments();

    await expect(claimBookingNotificationJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "booking-claim",
      requesterUid: "guest-1",
    })).resolves.toEqual({ status: "queued", claimedMarkers: 2 });

    expect(mocks.getFirestoreDocInTransaction.mock.calls.map((call) => call[2])).toEqual([
      "bookings/booking-claim",
      "booking_notification_jobs/booking-claim",
      "room_availability/room-1_2026-10-01",
      "room_availability/room-1_2026-10-02",
    ]);
    const [accessToken, projectId, transaction, writes] =
      mocks.commitFirestoreTransaction.mock.calls[0];
    expect([accessToken, projectId, transaction]).toEqual([
      "access-token",
      "test-project",
      "transaction-1",
    ]);
    expect(writes).toHaveLength(3);
    expect(writes.map((write) => write.update.name.split("/documents/")[1])).toEqual([
      "room_availability/room-1_2026-10-01",
      "room_availability/room-1_2026-10-02",
      "booking_notification_jobs/booking-claim",
    ]);
    expect(writes[2].update.fields.status).toEqual({ stringValue: "queued" });
    expect(mocks.rollbackFirestoreTransaction).not.toHaveBeenCalled();
  });

  it("does not commit when marker data conflicts or job dates are invalid", async () => {
    setClaimDocuments({
      marker: {
        exists: true,
        fields: claimFields({ bookingId: "another-booking", status: "Approved" }),
      },
    });

    await expect(claimBookingNotificationJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "booking-claim",
    })).resolves.toMatchObject({ status: "conflict" });
    expect(mocks.commitFirestoreTransaction).not.toHaveBeenCalled();
    expect(mocks.rollbackFirestoreTransaction).toHaveBeenCalledWith(
      "access-token",
      "test-project",
      "transaction-1",
    );

    vi.clearAllMocks();
    mocks.beginFirestoreTransaction.mockResolvedValue("transaction-1");
    mocks.rollbackFirestoreTransaction.mockResolvedValue(undefined);
    setClaimDocuments({ markerDates: ["2026-10-01", "2026-10-01"] });
    await expect(claimBookingNotificationJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "booking-claim",
    })).resolves.toMatchObject({ status: "conflict" });
    expect(mocks.commitFirestoreTransaction).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.beginFirestoreTransaction.mockResolvedValue("transaction-1");
    mocks.rollbackFirestoreTransaction.mockResolvedValue(undefined);
    setClaimDocuments({ markerDates: ["2026-11-01", "2026-11-02"] });
    await expect(claimBookingNotificationJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "booking-claim",
    })).resolves.toMatchObject({ status: "conflict" });
    expect(mocks.commitFirestoreTransaction).not.toHaveBeenCalled();
  });

  it("returns idempotent success for queued jobs and rejects a different owner", async () => {
    setClaimDocuments({ jobStatus: "queued" });
    await expect(claimBookingNotificationJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "booking-claim",
      requesterUid: "guest-1",
    })).resolves.toEqual({ status: "queued", claimedMarkers: 2 });
    expect(mocks.commitFirestoreTransaction).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.beginFirestoreTransaction.mockResolvedValue("transaction-1");
    mocks.rollbackFirestoreTransaction.mockResolvedValue(undefined);
    setClaimDocuments();
    await expect(claimBookingNotificationJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "booking-claim",
      requesterUid: "other-guest",
    })).resolves.toMatchObject({ status: "cancelled" });
    expect(mocks.commitFirestoreTransaction).not.toHaveBeenCalled();
  });

  it("retries an aborted commit and treats the winning queued job as success", async () => {
    setClaimDocuments();
    mocks.commitFirestoreTransaction
      .mockRejectedValueOnce(Object.assign(new Error("Firestore ABORTED"), { status: 409 }))
      .mockResolvedValueOnce(undefined);
    mocks.getFirestoreDocInTransaction.mockImplementation(async (_token, _project, path, transaction) => {
      expect(transaction).toMatch(/^transaction-/);
      const document = mocks.transactionDocuments[path];
      if (path === "booking_notification_jobs/booking-claim" && mocks.beginFirestoreTransaction.mock.calls.length > 1) {
        return {
          ...document,
          fields: claimFields({
            bookingId: "booking-claim",
            guestId: "guest-1",
            roomId: "room-1",
            paymentMethod: "GCash",
            markerDates: ["2026-10-01", "2026-10-02"],
            status: "queued",
          }),
        };
      }
      return document || { exists: false, fields: {} };
    });
    mocks.beginFirestoreTransaction
      .mockResolvedValueOnce("transaction-first")
      .mockResolvedValueOnce("transaction-second");

    await expect(claimBookingNotificationJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "booking-claim",
      requesterUid: "guest-1",
    })).resolves.toEqual({ status: "queued", claimedMarkers: 2 });

    expect(mocks.commitFirestoreTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.rollbackFirestoreTransaction).toHaveBeenCalledWith(
      "access-token",
      "test-project",
      "transaction-first",
    );
    expect(mocks.beginFirestoreTransaction).toHaveBeenCalledTimes(2);
  });

  it("recovers due jobs before delivering notices", async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    mocks.waitingJobs.booking_notification_jobs = [
      makeJob("booking-prod-recovery", {
        status: "waiting_for_markers",
        createdAt: due,
        nextAttemptAt: due,
      }),
    ];
    mocks.staff.users = [{ id: "fo-prod" }];
    setClaimDocuments({ bookingId: "booking-prod-recovery" });

    const result = await processBookingNotificationOutbox(WORKER_ENV);

    expect(result).toMatchObject({ delivered: 1, cancelled: 0, errors: 0 });
    expect(mocks.commitFirestoreTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.createFirestoreDoc.mock.calls.map((call) => call[2])).toEqual([
      "notifications/fo-prod/items",
      "notifications/guest-1/items",
    ]);
  });

  it("compensates marker conflicts and cancels their jobs atomically", async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    mocks.waitingJobs.booking_notification_jobs = [
      makeJob("booking-prod-conflict", {
        status: "waiting_for_markers",
        createdAt: due,
        nextAttemptAt: due,
      }),
    ];
    setClaimDocuments({
      bookingId: "booking-prod-conflict",
      marker: {
        exists: true,
        fields: claimFields({ bookingId: "someone-else", status: "Approved" }),
      },
    });

    const result = await processBookingNotificationOutbox(WORKER_ENV);

    expect(result).toMatchObject({ cancelled: 1, delivered: 0, errors: 0 });
    const writes = mocks.commitFirestoreTransaction.mock.calls.map((call) => call[3]);
    expect(writes).toHaveLength(1);
    expect(writes[0].map((write) => write.update?.name.split("/documents/")[1] || write.delete.split("/documents/")[1])).toEqual([
      "booking_notification_jobs/booking-prod-conflict",
      "bookings/booking-prod-conflict",
    ]);
    expect(writes[0][1].update.fields.status).toEqual({ stringValue: "Cancelled" });
  });

  it("backs off waiting jobs when the Worker claim fails transiently", async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    mocks.waitingJobs.booking_notification_jobs = [
      makeJob("booking-claim-retry", {
        status: "waiting_for_markers",
        createdAt: due,
        nextAttemptAt: due,
      }),
    ];
    mocks.beginFirestoreTransaction.mockRejectedValueOnce(new Error("temporary Firestore error"));

    const result = await processBookingNotificationOutbox(WORKER_ENV);

    expect(result).toMatchObject({ retried: 1, errors: 1 });
    expect(mocks.patchFirestoreDoc).toHaveBeenCalledWith(
      "access-token",
      "test-project",
      "booking_notification_jobs",
      "booking-claim-retry",
      expect.objectContaining({
        attempts: { integerValue: "1" },
        lastError: { stringValue: "temporary Firestore error" },
      }),
      expect.arrayContaining(["attempts", "lastError", "nextAttemptAt"]),
    );
  });

  it("fans out the existing payloads to production recipients", async () => {
    mocks.queuedJobs.booking_notification_jobs = [makeJob("booking-prod")];
    mocks.staff.users = [{ id: "fo-prod" }, { id: "guest-1" }];

    const result = await processBookingNotificationOutbox(WORKER_ENV);

    expect(result).toMatchObject({ ok: true, delivered: 1, errors: 0 });
    const writes = mocks.createFirestoreDoc.mock.calls;
    expect(writes.map(([, , collectionPath, documentId]) => [collectionPath, documentId])).toEqual([
      ["notifications/fo-prod/items", "booking_booking-prod_fo-prod_booking_request"],
      ["notifications/guest-1/items", "booking_booking-prod_guest-1_payment_proof_required"],
    ]);
    expect(writes[0][4]).toMatchObject({
      type: { stringValue: "booking_request" },
      title: { stringValue: "New Booking Request" },
      message: { stringValue: "Ava Guest requested Deluxe Suite from 10/1/2026 to 10/3/2026" },
      link: { stringValue: "/fo/bookings" },
    });
    expect(writes[1][4]).toMatchObject({
      type: { stringValue: "payment_proof_required" },
      title: { stringValue: "Payment Proof Required" },
      message: { stringValue: "Upload payment proof to complete your booking for Deluxe Suite" },
      link: { stringValue: "/my-bookings" },
    });
    expect(mocks.patchFirestoreDoc).toHaveBeenCalledWith(
      "access-token",
      "test-project",
      "booking_notification_jobs",
      "booking-prod",
      expect.objectContaining({ status: { stringValue: "delivered" } }),
      expect.arrayContaining(["status"]),
    );
  });

  it("does not invent Front Office recipients for an empty staff list", async () => {
    mocks.queuedJobs.booking_notification_jobs = [
      makeJob("booking-no-staff", { paymentMethod: "Over-the-Counter" }),
    ];

    const result = await processBookingNotificationOutbox(WORKER_ENV);

    expect(result).toMatchObject({ delivered: 1, errors: 0 });
    expect(mocks.createFirestoreDoc).not.toHaveBeenCalled();
  });

  it("retries partial delivery with the same IDs and records the failure", async () => {
    mocks.queuedJobs.booking_notification_jobs = [makeJob("booking-retry")];
    mocks.staff.users = [{ id: "fo-1" }];
    mocks.createFirestoreDoc
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("temporary inbox write failure"));

    const first = await processBookingNotificationOutbox(WORKER_ENV);

    expect(first).toMatchObject({ retried: 1, errors: 1 });
    expect(mocks.patchFirestoreDoc).toHaveBeenCalledWith(
      "access-token",
      "test-project",
      "booking_notification_jobs",
      "booking-retry",
      expect.objectContaining({
        attempts: { integerValue: "1" },
        lastError: { stringValue: "temporary inbox write failure" },
      }),
      expect.arrayContaining(["attempts", "lastError", "nextAttemptAt"]),
    );

    mocks.createFirestoreDoc
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const second = await processBookingNotificationOutbox(WORKER_ENV);

    expect(second).toMatchObject({ delivered: 1, errors: 0 });
    const notificationIds = mocks.createFirestoreDoc.mock.calls
      .map(([, , , id]) => id)
      .filter((id) => id.includes("booking-retry"));
    expect(notificationIds).toEqual([
      "booking_booking-retry_fo-1_booking_request",
      "booking_booking-retry_guest-1_payment_proof_required",
      "booking_booking-retry_fo-1_booking_request",
      "booking_booking-retry_guest-1_payment_proof_required",
    ]);
  });

  it("retries when the delivered-state patch fails without replacing inbox docs", async () => {
    mocks.queuedJobs.booking_notification_jobs = [
      makeJob("booking-patch-retry", { paymentMethod: "Over-the-Counter" }),
    ];
    mocks.staff.users = [{ id: "fo-1" }];
    mocks.patchFirestoreDoc
      .mockRejectedValueOnce(new Error("delivered patch failed"))
      .mockResolvedValue(undefined);

    const first = await processBookingNotificationOutbox(WORKER_ENV);

    expect(first).toMatchObject({ retried: 1, errors: 1 });
    expect(mocks.createFirestoreDoc).toHaveBeenCalledTimes(1);

    mocks.createFirestoreDoc.mockResolvedValueOnce(false);
    const second = await processBookingNotificationOutbox(WORKER_ENV);

    expect(second).toMatchObject({ delivered: 1, errors: 0 });
    expect(mocks.createFirestoreDoc).toHaveBeenCalledTimes(2);
    expect(mocks.createFirestoreDoc.mock.calls[1][3]).toBe(mocks.createFirestoreDoc.mock.calls[0][3]);
  });

  it("cancels only stale waiting jobs whose booking is missing or terminal", async () => {
    const stale = new Date(Date.now() - 16 * 60_000).toISOString();
    mocks.waitingJobs.booking_notification_jobs = [
      makeJob("missing-booking", {
        status: "waiting_for_markers",
        createdAt: stale,
        nextAttemptAt: stale,
      }),
      makeJob("cancelled-booking", {
        status: "waiting_for_markers",
        createdAt: stale,
        nextAttemptAt: stale,
      }),
      makeJob("active-booking", {
        status: "waiting_for_markers",
        createdAt: stale,
        nextAttemptAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    ];
    for (const [bookingId, bookingStatus] of [
      ["missing-booking", null],
      ["cancelled-booking", "Cancelled"],
      ["active-booking", "Pending"],
    ]) {
      mocks.transactionDocuments[`booking_notification_jobs/${bookingId}`] = {
        exists: true,
        fields: claimFields({ status: "waiting_for_markers" }),
      };
      mocks.transactionDocuments[`bookings/${bookingId}`] = bookingStatus
        ? { exists: true, fields: claimFields({ status: bookingStatus }) }
        : { exists: false, fields: {} };
    }
    mocks.getFirestoreDocInTransaction.mockImplementation(async (_token, _project, path) => {
      return mocks.transactionDocuments[path] || { exists: false, fields: {} };
    });

    const result = await processBookingNotificationOutbox(WORKER_ENV);

    expect(result).toMatchObject({ cancelled: 2, errors: 0 });
    expect(mocks.commitFirestoreTransaction.mock.calls.map((call) =>
      call[3][0].update.name.split("/documents/")[1],
    )).toEqual([
      "booking_notification_jobs/missing-booking",
      "booking_notification_jobs/cancelled-booking",
    ]);
  });
});

describe("deliverQueuedJob", () => {
  function queuedJobDoc(overrides = {}) {
    return {
      exists: true,
      fields: claimFields({
        status: "queued",
        bookingId: "job-1",
        guestId: "guest-1",
        roomId: "room-1",
        roomName: "Deluxe Suite",
        checkIn: "10/1/2026",
        checkOut: "10/3/2026",
        paymentMethod: "GCash",
        attempts: 0,
        ...overrides,
      }),
    };
  }

  it("delivers a queued job immediately with the same deterministic IDs", async () => {
    mocks.getFirestoreDoc.mockResolvedValueOnce(queuedJobDoc());
    mocks.staff.users = [{ id: "fo-1" }];

    await expect(deliverQueuedJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "job-1",
    })).resolves.toEqual({ delivered: true });

    expect(mocks.getFirestoreDoc).toHaveBeenCalledWith(
      "access-token",
      "test-project",
      "booking_notification_jobs",
      "job-1",
    );
    expect(mocks.createFirestoreDoc.mock.calls.map(([, , path, id]) => [path, id])).toEqual([
      ["notifications/fo-1/items", "booking_job-1_fo-1_booking_request"],
      ["notifications/guest-1/items", "booking_job-1_guest-1_payment_proof_required"],
    ]);
    expect(mocks.patchFirestoreDoc).toHaveBeenCalledWith(
      "access-token",
      "test-project",
      "booking_notification_jobs",
      "job-1",
      expect.objectContaining({ status: { stringValue: "delivered" } }),
      expect.arrayContaining(["status"]),
    );
  });

  it("skips missing or non-queued jobs without writing", async () => {
    mocks.getFirestoreDoc.mockResolvedValueOnce({ exists: false, fields: {} });
    await expect(deliverQueuedJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "job-gone",
    })).resolves.toEqual({ delivered: false });

    mocks.getFirestoreDoc.mockResolvedValueOnce(queuedJobDoc({ status: "delivered" }));
    await expect(deliverQueuedJob({
      accessToken: "access-token",
      projectId: "test-project",
      bookingId: "job-1",
    })).resolves.toEqual({ delivered: false });

    expect(mocks.createFirestoreDoc).not.toHaveBeenCalled();
    expect(mocks.patchFirestoreDoc).not.toHaveBeenCalled();
  });
});

describe("createFirestoreDoc", () => {
  it("treats create conflict as delivered without issuing an overwrite", async () => {
    const { createFirestoreDoc } = await vi.importActual("./firestore.js");
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => "already exists",
    });
    globalThis.fetch = fetchMock;

    try {
      await expect(
        createFirestoreDoc("token", "project", "notifications/guest/items", "stable-id", {
          isRead: { booleanValue: false },
        }),
      ).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Firestore transaction REST helpers", () => {
  it("begins, reads, commits, and rolls back with the transaction token", async () => {
    const {
      beginFirestoreTransaction,
      getFirestoreDocInTransaction,
      commitFirestoreTransaction,
      rollbackFirestoreTransaction,
    } = await vi.importActual("./firestore.js");
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: "transaction-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fields: { status: { stringValue: "Pending" } },
          updateTime: "2026-10-08T00:00:00Z",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ commitTime: "2026-10-08T00:00:01Z" }),
      })
      .mockResolvedValueOnce({ ok: true });
    globalThis.fetch = fetchMock;

    try {
      const transaction = await beginFirestoreTransaction("token", "project");
      await expect(getFirestoreDocInTransaction(
        "token",
        "project",
        "bookings/booking-1",
        transaction,
      )).resolves.toMatchObject({
        exists: true,
        fields: { status: { stringValue: "Pending" } },
        updateTime: "2026-10-08T00:00:00Z",
      });
      const writes = [{ update: { name: "projects/project/documents/bookings/booking-1", fields: {} } }];
      await commitFirestoreTransaction("token", "project", transaction, writes);
      await rollbackFirestoreTransaction("token", "project", transaction);

      expect(fetchMock.mock.calls[0][0]).toContain(":beginTransaction");
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ options: { readWrite: {} } }));
      expect(fetchMock.mock.calls[1][0]).toContain("?transaction=transaction-token");
      expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ transaction, writes });
      expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ transaction });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves the HTTP status on transaction commit failures", async () => {
    const { commitFirestoreTransaction } = await vi.importActual("./firestore.js");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => "ABORTED",
    });

    try {
      await expect(commitFirestoreTransaction(
        "token",
        "project",
        "transaction",
        [],
      )).rejects.toMatchObject({ status: 409 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
