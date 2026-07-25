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
import { listUsers } from "@/services/userService";
import { createNotification } from "@/services/notificationService";

const MESSAGES_COL = "messages";

async function sendReplyEmail({ toEmail, name, subject, replyMessage }) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error("EmailJS is not configured.");
  }

  const templateParams = {
    to_email: toEmail,
    to_name: name,
    subject: `Re: ${subject}`,
    reply_message: replyMessage,
  };

  await emailjs.send(serviceId, templateId, templateParams, publicKey);
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

  const targetSnap = await getDoc(doc(db, MESSAGES_COL, messageId));
  if (!targetSnap.exists()) throw new Error("Message not found.");
  const target = { id: targetSnap.id, ...targetSnap.data() };

  await updateDoc(doc(db, MESSAGES_COL, messageId), {
    status: "replied",
    replyMessage: cleanReply,
    repliedAt: serverTimestamp(),
  });

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
