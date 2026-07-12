import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/firebase/firebase.config";
import { listUsers } from "@/services/userService";
import { createNotification } from "@/services/notificationService";

const MESSAGES_COL = "messages";
const ENABLE_SUPPORT_REPLY_EMAIL =
  String(import.meta.env.VITE_ENABLE_SUPPORT_REPLY_EMAIL || "").toLowerCase() === "true";

async function sendReplyEmail({ toEmail, name, subject, replyMessage }) {
  const functions = getFunctions();
  const callableNames = ["sendSupportReplyEmail", "sendEmailReply", "sendEmail"];
  let lastError = null;

  for (const fnName of callableNames) {
    try {
      const call = httpsCallable(functions, fnName);
      await call({
        to: toEmail,
        subject: `Re: ${subject}`,
        guestName: name,
        replyMessage,
      });
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || "Failed to send email reply.");
}

export async function submitMessage({ name, email, subject, message, guestId = null }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();
  const cleanSubject = String(subject || "").trim();
  const cleanMessage = String(message || "").trim();

  if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
    throw new Error("Please complete all required fields.");
  }

  const ref = doc(collection(db, MESSAGES_COL));
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
    const users = await listUsers();
    const foUsers = users.filter((u) => u.role === "fo");
    await Promise.all(
      foUsers.map((fo) =>
        createNotification(fo.id, {
          type: "support_message",
          title: "New Support Message 💬",
          message: `${cleanName} sent a message: ${cleanSubject}`,
          link: "/fo/messages",
        }),
      ),
    );
  } catch (e) {
    console.error("Failed to fan out FO support notifications:", e);
  }

  return { id: ref.id };
}

export async function getAllMessages() {
  const q = query(collection(db, MESSAGES_COL), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToMessages(callback) {
  const q = query(collection(db, MESSAGES_COL), orderBy("createdAt", "desc"));
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
  await updateDoc(doc(db, MESSAGES_COL, messageId), {
    status: "read",
  });
  return { ok: true };
}

export async function replyToMessage(messageId, replyMessage) {
  if (!messageId) throw new Error("Message ID is required.");
  const cleanReply = String(replyMessage || "").trim();
  if (!cleanReply) throw new Error("Reply message is required.");

  const messages = await getAllMessages();
  const target = messages.find((m) => m.id === messageId);
  if (!target) throw new Error("Message not found.");

  await updateDoc(doc(db, MESSAGES_COL, messageId), {
    status: "replied",
    replyMessage: cleanReply,
    repliedAt: serverTimestamp(),
  });

  if (!ENABLE_SUPPORT_REPLY_EMAIL) {
    return { ok: true, emailSent: false, reason: "Support reply email is disabled in this environment." };
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
