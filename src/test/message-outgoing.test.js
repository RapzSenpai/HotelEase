import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ status: 200, text: "OK" })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  getDoc: vi.fn(),
  collection: vi.fn((_db, path) => ({ path })),
  // Handles both doc(db, path, id) and doc(collectionRef) call shapes.
  doc: vi.fn((first, col, id) => ({
    path: typeof first === "object" && first?.path ? first.path : col,
    id: id || "msg-1",
  })),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
  collectionName: "messages",
}));

vi.mock("@emailjs/browser", () => ({ default: { send: mocks.send } }));
vi.mock("firebase/firestore", () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: mocks.serverTimestamp,
  updateDoc: mocks.updateDoc,
  setDoc: mocks.setDoc,
}));
vi.mock("@/services/userService", () => ({ listFoUsers: vi.fn(async () => []) }));
vi.mock("@/services/notificationService", () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/db-utils", () => ({ getCol: () => mocks.collectionName }));

const { sendMessageToGuest, replyToMessage } = await import("@/services/messageService");

describe("sendMessageToGuest", () => {
  beforeEach(() => {
    mocks.collectionName = "messages";
    vi.stubEnv("VITE_EMAILJS_SERVICE_ID", "svc-1");
    vi.stubEnv("VITE_EMAILJS_REPLY_TEMPLATE_ID", "tpl-shared");
    vi.stubEnv("VITE_EMAILJS_PUBLIC_KEY", "key-1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects an invalid recipient email", async () => {
    await expect(
      sendMessageToGuest({ toEmail: "nope", subject: "Hi", message: "x".repeat(30), sentBy: "u1" }),
    ).rejects.toThrow("valid recipient email");
  });

  it("rejects a too-short message", async () => {
    await expect(
      sendMessageToGuest({ toEmail: "g@x.com", subject: "Hi", message: "too short", sentBy: "u1" }),
    ).rejects.toThrow("between 20 and 2000");
  });

  it("emails via the shared template and records the outgoing message", async () => {
    const result = await sendMessageToGuest({
      toEmail: "guest@example.com",
      toName: "Juan",
      subject: "Your stay",
      message: "Thanks for staying with HotelEase. See you again!",
      sentBy: "admin-1",
      sentByName: "Admin A",
    });

    expect(result).toEqual({ ok: true, emailSent: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const [serviceId, templateId, params, publicKey] = mocks.send.mock.calls[0];
    expect(serviceId).toBe("svc-1");
    expect(templateId).toBe("tpl-shared");
    expect(publicKey).toBe("key-1");
    expect(params.to_email).toBe("guest@example.com");
    expect(params.to_name).toBe("Juan");
    expect(params.subject).toBe("Your stay");
    expect(params.eyebrow).toBe("Message from HotelEase");
    expect(params.bodyHTML).toContain("Thanks for staying with HotelEase. See you again!");
    expect(params.bodyHTML).toContain(">Message</p>");

    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = mocks.setDoc.mock.calls[0];
    expect(ref.path).toBe("messages");
    expect(payload).toMatchObject({
      id: "msg-1",
      direction: "outgoing",
      toName: "Juan",
      toEmail: "guest@example.com",
      subject: "Your stay",
      message: "Thanks for staying with HotelEase. See you again!",
      status: "sent",
      sentBy: "admin-1",
      sentByName: "Admin A",
      emailSent: false,
      createdAt: "SERVER_TS",
    });
    expect(mocks.updateDoc).toHaveBeenCalledWith(ref, { emailSent: true });
    expect(mocks.setDoc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0],
    );
    expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateDoc.mock.invocationCallOrder[0],
    );
  });

  it("still records the message when email delivery fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockRejectedValueOnce(new Error("quota exhausted"));

    const result = await sendMessageToGuest({
      toEmail: "guest@example.com",
      subject: "Heads up",
      message: "Delivery best effort message body here.",
      sentBy: "admin-1",
    });

    expect(result).toEqual({ ok: true, emailSent: false });
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({
      emailSent: false,
      toName: "Guest",
      sentByName: "Staff",
    });
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("stores sandbox messages without sending email", async () => {
    mocks.collectionName = "messages_training";

    const result = await sendMessageToGuest({
      toEmail: "guest@example.com",
      subject: "Training message",
      message: "This message stays in the training sandbox.",
      sentBy: "admin-1",
    });

    expect(result).toEqual({ ok: true, emailSent: false });
    expect(mocks.collection).toHaveBeenCalledWith(expect.anything(), "messages_training");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.setDoc.mock.calls[0][1].emailSent).toBe(false);
  });

  it("does not report delivery as failed when saving its audit flag fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateDoc.mockRejectedValueOnce(new Error("permission denied"));

    const result = await sendMessageToGuest({
      toEmail: "guest@example.com",
      subject: "Delivery audit",
      message: "The message is delivered before its audit update.",
      sentBy: "admin-1",
    });

    expect(result).toEqual({ ok: true, emailSent: true, auditUpdateFailed: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("keeps reply emails on the same shared template with the old wording", async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: "m1",
      data: () => ({ email: "guest@example.com", name: "Juan", subject: "Booking Question" }),
    });

    const result = await replyToMessage("m1", "We fixed it for you.");

    expect(result).toEqual({ ok: true, emailSent: true });
    const params = mocks.send.mock.calls[0][2];
    expect(params.subject).toBe("Re: Booking Question");
    expect(params.eyebrow).toBe("Support Reply");
    expect(params.bodyHTML).toContain("Our Reply");
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
  });
});
