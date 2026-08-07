import emailjs from "@emailjs/browser";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { buildOtpBody } from "@/services/emailHtml";

// Client-side OTP email verification (no Cloud Functions on Firebase free plan).
// Code generation, storage (SHA-256 hash), and checking all happen in the browser,
// so this is demo-grade security: it forces the guest to use an email they can
// actually receive mail on, but a determined DevTools attacker could bypass it.

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashOtp(otp) {
  const data = new TextEncoder().encode(`he:${otp}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendVerificationEmail({ toEmail, toName, otp }) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_VERIFY_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error("EmailJS verification is not configured.");
  }

  await emailjs.send(
    serviceId,
    templateId,
    {
      to_email: toEmail,
      to_name: toName,
      subject: "HotelEase — Your Verification Code",
      eyebrow: "Account Verification",
      bodyHTML: buildOtpBody(otp),
    },
    publicKey,
  );
}

/**
 * Generate + email a verification code, storing its hash on the user doc.
 * Respects a resend cooldown.
 */
export async function issueVerificationCode({
  uid,
  email,
  fullName = "",
  trainingMode = false,
} = {}) {
  if (!uid || !email) throw new Error("Missing uid/email for verification.");

  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("User profile not found.");

  const resendAt = Number(snap.data().verificationResendAt ?? 0);
  if (Date.now() < resendAt) {
    const wait = Math.ceil((resendAt - Date.now()) / 1000);
    return { ok: false, reason: `Please wait ${wait}s before resending.` };
  }

  const otp = generateOtp();
  const hash = await hashOtp(otp);

  await updateDoc(ref, {
    verificationCodeHash: hash,
    verificationExpiresAt: Date.now() + CODE_TTL_MS,
    verificationAttempts: 0,
    verificationResendAt: Date.now() + RESEND_COOLDOWN_MS,
    updatedAt: serverTimestamp(),
  });

  await sendVerificationEmail({
    toEmail: email,
    toName: fullName || "Guest",
    otp,
  });

  return { ok: true };
}

/**
 * Verify a submitted code against the stored hash. Bounded attempts + expiry.
 * On success marks the guest's profile emailVerified.
 */
export async function verifyEmailCode({ uid, code, trainingMode = false } = {}) {
  if (!uid || !code) return { ok: false, reason: "Missing code." };

  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, reason: "User profile not found." };

  const data = snap.data();
  if (data.emailVerified) return { ok: true, alreadyVerified: true };

  const attempts = Number(data.verificationAttempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "Too many failed attempts. Request a new code." };
  }

  if (Number(data.verificationExpiresAt ?? 0) < Date.now()) {
    return { ok: false, reason: "Code expired. Request a new one." };
  }

  const hash = await hashOtp(String(code).trim());
  if (hash !== data.verificationCodeHash) {
    const next = attempts + 1;
    await updateDoc(ref, {
      verificationAttempts: next,
      updatedAt: serverTimestamp(),
    });
    const remaining = MAX_ATTEMPTS - next;
    return {
      ok: false,
      reason:
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "No attempts left. Request a new code.",
    };
  }

  await updateDoc(ref, {
    emailVerified: true,
    verifiedAt: serverTimestamp(),
    verificationCodeHash: null,
    verificationExpiresAt: null,
    verificationAttempts: null,
    verificationResendAt: null,
    updatedAt: serverTimestamp(),
  });

  return { ok: true };
}
