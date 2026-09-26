import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
} from "firebase/firestore";
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

async function sendReplyEmail({ toEmail, name, subject, replyMessage }) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_REPLY_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error("EmailJS is not configured. Make sure VITE_EMAILJS_REPLY_TEMPLATE_ID is set in .env");
  }

  const templateParams = {
    to_email: toEmail,
    to_name: name,
    subject: `Re: ${subject}`,
    eyebrow: "Support Reply",
    bodyHTML: buildReplyBody(subject, replyMessage),
  };

  await emailjs.send(serviceId, templateId, templateParams, publicKey);
}

export async function submitMessage({ name, email, subject, message, guestId = null, honeypot = "", trainingMode = null }) {
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

  // Cooldown key is per-mode so training submits never throttle prod ones.
  const sentKey = trainingMode ? `${LAST_SENT_KEY}_training` : LAST_SENT_KEY;
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

  const ref = doc(collection(db, getCol(MESSAGES_COL, trainingMode)));
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
    replyMessage: null,
  });

  try {
    try { localStorage.setItem(sentKey, String(Date.now())); } catch { /* ignore */ }
    // Guest-safe: only read FO-role users (guests must not list other guests).
    const foUsers = await listFoUsers({ trainingMode });
    await Promise.all(
      foUsers.map((fo) =>
        createNotification(fo.id, {
          type: "support_message",
          title: "New Support Message 💬",
          message: `${cleanName} sent a message: ${cleanSubject}`,
          link: "/fo/messages",
        }, { trainingMode }),
      ),
    );
  } catch (e) {
    console.error("Failed to fan out FO support notifications:", e);
  }

  return { id: ref.id };
}

export async function getAllMessages({ trainingMode = null } = {}) {
  const col = getCol(MESSAGES_COL, trainingMode);
  const q = query(collection(db, col), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToMessages(callback, { trainingMode = null } = {}) {
  const col = getCol(MESSAGES_COL, trainingMode);
  const q = query(collection(db, col), orderBy("createdAt", "desc"));
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

export async function markAsRead(messageId, { trainingMode = null } = {}) {
  if (!messageId) throw new Error("Message ID is required.");
  await updateDoc(doc(db, getCol(MESSAGES_COL, trainingMode), messageId), {
    status: "read",
  });
  return { ok: true };
}

export async function replyToMessage(messageId, replyMessage, { trainingMode = null } = {}) {
  if (!messageId) throw new Error("Message ID is required.");
  const cleanReply = String(replyMessage || "").trim();
  if (!cleanReply) throw new Error("Reply message is required.");

  const col = getCol(MESSAGES_COL, trainingMode);
  const targetSnap = await getDoc(doc(db, col, messageId));
  if (!targetSnap.exists()) throw new Error("Message not found.");
  const target = { id: targetSnap.id, ...targetSnap.data() };

  await updateDoc(doc(db, col, messageId), {
    status: "replied",
    replyMessage: cleanReply,
    repliedAt: serverTimestamp(),
  });

  // Training replies stay in the sandbox — never send real email for them.
  if (col !== MESSAGES_COL) {
    return { ok: true, emailSent: false, reason: "Training message. No email sent." };
  }

  try {
    await sendReplyEmail({
      toEmail: target.email,
      name: target.name,
      subject: target.subject,
      replyMessage: cleanReply,
    });
    return { ok: true, emailSent: true };
  } catch (error) {
    console.error("Support reply email failed:", error);
    return {
      ok: true,
      emailSent: false,
      reason: error?.message || "Email service is unavailable.",
    };
  }
}
