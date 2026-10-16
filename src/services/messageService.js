import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc} from "firebase/firestore";
import emailjs from "@emailjs/browser";
import { db } from "@/firebase/firebase.config";
import { listFoUsers } from "@/services/userService";
import { createNotification } from "@/services/notificationService";
import { getCol } from "@/lib/db-utils";
import { buildReplyBody } from "@/services/emailHtml";

const MESSAGES_COL = "messages";

// Shared guard: the ContactPage cooldown is UX only — every caller routes
// through here, so the service enforces shape + per-device throttle once.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_COOLDOWN_MS = 30_000;
const LAST_SENT_KEY = "hotelease_last_message_at";

// Shared generic EmailJS shell (template_mt0d9ao): replies, verification
// codes, and staff outbound messages all fill the same {{bodyHTML}} slot.
async function sendGenericEmail({ toEmail, toName, subject, eyebrow, bodyHTML }) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_REPLY_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error("EmailJS is not configured. Make sure VITE_EMAILJS_REPLY_TEMPLATE_ID is set in .env");
  }

  await emailjs.send(
    serviceId,
    templateId,
    { to_email: toEmail, to_name: toName, subject, eyebrow, bodyHTML },
    publicKey);
}

function sendReplyEmail({ toEmail, name, subject, replyMessage }) {
  return sendGenericEmail({
    toEmail,
    toName: name,
    subject: `Re: ${subject}`,
    eyebrow: "Support Reply",
    bodyHTML: buildReplyBody(subject, replyMessage)});
}

export async function submitMessage({ name, email, subject, message, guestId = null, honeypot = "" }) {
  // Bot trap: fake success so automated senders don't learn the field name.
  if (String(honeypot || "").trim()) return { id: null };

  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();
  const cleanSubject = String(subject || "").trim();
  const cleanMessage = String(message || "").trim();

  if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
    throw new Error("Please complete all required fields.");
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    throw new Error("Please enter a valid email.");
  }
  if (cleanMessage.length < 20 || cleanMessage.length > 2000) {
    throw new Error("Message must be between 20 and 2000 characters.");
  }

  // Cooldown key follows the resolved collection (not the raw flag) so it
  // can never disagree with where the message is actually stored.
  const sentKey =
    getCol(MESSAGES_COL) !== MESSAGES_COL
      ? `${LAST_SENT_KEY}_training`
      : LAST_SENT_KEY;
  try {
    const lastSent = Number(localStorage.getItem(sentKey) || 0);
    const waitMs = MESSAGE_COOLDOWN_MS - (Date.now() - lastSent);
    if (waitMs > 0) {
      throw new Error(`Please wait ${Math.ceil(waitMs / 1000)} seconds before sending another message.`);
    }
  } catch (e) {
    if (e?.message?.startsWith("Please wait")) throw e;
    // ignore storage errors
  }

  const ref = doc(collection(db, getCol(MESSAGES_COL)));
  await setDoc(ref, {
    id: ref.id,
    name: cleanName,
    email: cleanEmail,
    subject: cleanSubject,
    message: cleanMessage,
    status: "unread",
    guestId: guestId || null,
    createdAt: serverTimestamp(),
    repliedAt: null,
    replyMessage: null});

  try {
    try { localStorage.setItem(sentKey, String(Date.now())); } catch { /* ignore */ }
    // Guest-safe: only read FO-role users (guests must not list other guests).
    const foUsers = await listFoUsers();
    await Promise.all(
      foUsers.map((fo) =>
        createNotification(fo.id, {
          type: "support_message",
          title: "New Support Message 💬",
          message: `${cleanName} sent a message: ${cleanSubject}`,
          link: "/fo/messages"})));
  } catch (e) {
    console.error("Failed to fan out FO support notifications:", e);
  }

  return { id: ref.id };
}

// P2 scalability: support inboxes stay small, but neither reader assumes it.
// 500 is far above any real inbox — the cap only guards pathological growth.
export const MESSAGES_PAGE_SIZE = 500;

export async function getAllMessages({ limitCount = MESSAGES_PAGE_SIZE } = {}) {
  const col = getCol(MESSAGES_COL);
  const q = query(collection(db, col), orderBy("createdAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToMessages(callback, { limitCount = MESSAGES_PAGE_SIZE } = {}) {
  const col = getCol(MESSAGES_COL);
  const q = query(collection(db, col), orderBy("createdAt", "desc"), limit(limitCount));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error("[messageService] subscribeToMessages error:", error);
      callback([]);
    }
  );
}

export async function markAsRead(messageId) {
  if (!messageId) throw new Error("Message ID is required.");
  await updateDoc(doc(db, getCol(MESSAGES_COL), messageId), {
    status: "read"});
  return { ok: true };
}

export async function replyToMessage(messageId, replyMessage) {
  if (!messageId) throw new Error("Message ID is required.");
  const cleanReply = String(replyMessage || "").trim();
  if (!cleanReply) throw new Error("Reply message is required.");

  const col = getCol(MESSAGES_COL);
  const targetSnap = await getDoc(doc(db, col, messageId));
  if (!targetSnap.exists()) throw new Error("Message not found.");
  const target = { id: targetSnap.id, ...targetSnap.data() };

  await updateDoc(doc(db, col, messageId), {
    status: "replied",
    replyMessage: cleanReply,
    repliedAt: serverTimestamp()});

  // Training replies stay in the sandbox — never send real email for them.
  if (col !== MESSAGES_COL) {
    return { ok: true, emailSent: false, reason: "Training message. No email sent." };
  }

  try {
    await sendReplyEmail({
      toEmail: target.email,
      name: target.name,
      subject: target.subject,
      replyMessage: cleanReply});
    return { ok: true, emailSent: true };
  } catch (error) {
    console.error("Support reply email failed:", error);
    return {
      ok: true,
      emailSent: false,
      reason: error?.message || "Email service is unavailable."};
  }
}

// Staff-composed outbound message (New Message tab): recorded before the
// best-effort email attempt so a delivery result can update its audit flag.
export async function sendMessageToGuest({ toEmail, toName, subject, message, sentBy, sentByName }) {
  const cleanToEmail = String(toEmail || "").trim();
  const cleanSubject = String(subject || "").trim();
  const cleanMessage = String(message || "").trim();
  const cleanToName = String(toName || "").trim().slice(0, 100) || "Guest";
  const cleanSentByName = String(sentByName || "").trim().slice(0, 100) || "Staff";

  if (!cleanToEmail || !EMAIL_RE.test(cleanToEmail)) {
    throw new Error("Please enter a valid recipient email.");
  }
  if (!cleanSubject) throw new Error("Subject is required.");
  if (cleanSubject.length > 200) throw new Error("Subject must be at most 200 characters.");
  if (cleanMessage.length < 20 || cleanMessage.length > 2000) {
    throw new Error("Message must be between 20 and 2000 characters.");
  }
  if (!sentBy) throw new Error("Missing sender for the outgoing message.");

  const col = getCol(MESSAGES_COL);
  const ref = doc(collection(db, col));
  await setDoc(ref, {
    id: ref.id,
    direction: "outgoing",
    toName: cleanToName,
    toEmail: cleanToEmail,
    subject: cleanSubject,
    message: cleanMessage,
    status: "sent",
    sentBy,
    sentByName: cleanSentByName,
    emailSent: false,
    createdAt: serverTimestamp()});

  let emailSent = false;
  if (col === MESSAGES_COL) {
    try {
      await sendGenericEmail({
        toEmail: cleanToEmail,
        toName: cleanToName,
        subject: cleanSubject,
        eyebrow: "Message from HotelEase",
        bodyHTML: buildReplyBody(cleanSubject, cleanMessage, "Message")});
      emailSent = true;
    } catch (error) {
      console.error("Outgoing message email failed:", error);
    }

    if (emailSent) {
      try {
        await updateDoc(ref, { emailSent: true });
      } catch (error) {
        console.error("Outgoing message delivery status update failed:", error);
        return { ok: true, emailSent: true, auditUpdateFailed: true };
      }
    }
  }

  return { ok: true, emailSent };
}
