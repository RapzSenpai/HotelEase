// Moved verbatim from src/index.js — Firebase ID-token verification, no logic changes.
import { FIREBASE_CERTS_URL, TOKEN_SKEW_SECONDS } from "./config.js";

// ===========================================================================
// AI abuse protection: Firebase ID token verification + tiered limits
//
// Tiers (per isolate for minute limits; KV-backed per day):
//   signed-in user  → 20 req/min, 100 req/day  (keyed by uid)
//   anonymous       →  3 req/min,  5 req/day   (keyed by IP)
// /insights and /admin-chat additionally require a verified user token.
// Anonymous Firebase sessions (training sandbox) count as anonymous.
// ===========================================================================

let firebaseCertsCache = null; // { certs: Map<kid, pem>, fetchedAt }

function base64ToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Decode a PEM certificate body ("-----BEGIN CERTIFICATE-----..." wrapper
 * removed) into DER bytes. The armor lines are plain ASCII and corrupt the
 * output if fed through a lenient base64 decoder.
 */
function pemToDerBytes(pem) {
  const body = String(pem)
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  return base64ToBytes(body);
}

function decodeJwtSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64ToBytes(segment)));
}

async function getFirebasePublicCerts() {
  if (firebaseCertsCache && Date.now() - firebaseCertsCache.fetchedAt < 60 * 60 * 1000) {
    return firebaseCertsCache.certs;
  }
  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Firebase public certs (${res.status})`);
  const obj = await res.json();
  firebaseCertsCache = { certs: new Map(Object.entries(obj)), fetchedAt: Date.now() };
  return firebaseCertsCache.certs;
}

function readDerTlv(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i += 1) len = len * 256 + buf[pos + 2 + i];
    return { tag, contentStart: pos + 2 + n, contentLen: len };
  }
  return { tag, contentStart: pos + 2, contentLen: len };
}

function derSequence(contentBytes) {
  const len = contentBytes.length;
  let header;
  if (len < 128) {
    header = new Uint8Array([0x30, len]);
  } else {
    const lenBytes = [];
    let l = len;
    while (l > 0) {
      lenBytes.unshift(l & 0xff);
      l >>= 8;
    }
    header = new Uint8Array([0x30, 0x80 | lenBytes.length, ...lenBytes]);
  }
  const out = new Uint8Array(header.length + len);
  out.set(header, 0);
  out.set(contentBytes, header.length);
  return out;
}

/**
 * Extract the SubjectPublicKeyInfo DER from an X.509 certificate.
 * Inside tbsCertificate the SPKI is the only SEQUENCE whose second child is a
 * BIT STRING, so it can be located without a full ASN.1 library.
 */
function extractSpkiFromCertificate(certDer) {
  const outer = readDerTlv(certDer, 0); // Certificate SEQUENCE
  const tbs = readDerTlv(certDer, outer.contentStart); // tbsCertificate
  const end = Math.min(tbs.contentStart + tbs.contentLen, certDer.length);

  let pos = tbs.contentStart;
  while (pos < end) {
    const tlv = readDerTlv(certDer, pos);
    if (tlv.tag === 0x30 && tlv.contentStart + tlv.contentLen <= end) {
      const first = readDerTlv(certDer, tlv.contentStart);
      const secondPos = first.contentStart + first.contentLen;
      if (secondPos < end) {
        const second = readDerTlv(certDer, secondPos);
        if (first.tag === 0x30 && second.tag === 0x03) {
          return derSequence(certDer.subarray(tlv.contentStart, tlv.contentStart + tlv.contentLen));
        }
      }
    }
    pos = tlv.contentStart + tlv.contentLen;
  }
  throw new Error("SubjectPublicKeyInfo not found in certificate");
}

export async function verifyFirebaseIdToken(token, projectId) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    let header;
    let claims;
    try {
      header = decodeJwtSegment(parts[0]);
      claims = decodeJwtSegment(parts[1]);
    } catch {
      return null;
    }
    if (!header || header.alg !== "RS256" || typeof claims !== "object" || claims === null) {
      return null;
    }

    const certs = await getFirebasePublicCerts();
    const pem = certs.get(String(header.kid || ""));
    if (!pem) return null;

    const spkiDer = extractSpkiFromCertificate(pemToDerBytes(pem));
    const key = await crypto.subtle.importKey(
      "spki",
      spkiDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = base64ToBytes(parts[2]);
    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, signedData);
    if (!valid) {
      console.error("verifyFirebaseIdToken: signature check failed");
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp < now - TOKEN_SKEW_SECONDS) return null;
    if (typeof claims.iat !== "number" || claims.iat > now + TOKEN_SKEW_SECONDS) return null;
    if (claims.aud !== projectId) return null;
    if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
    return claims;
  } catch (e) {
    console.error("verifyFirebaseIdToken: verification error:", String(e?.message || e).slice(0, 200));
    return null;
  }
}

/**
 * Resolve the caller tier from the X-HE-AUTH header.
 * Returns { uid } for verified real users, or { uid: null } for everyone else
 * (missing header, bad/expired token, or anonymous training sessions).
 */
export async function resolveAiIdentity(request, workerEnv) {
  const header = request.headers.get("X-HE-AUTH") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !workerEnv.FIREBASE_SERVICE_ACCOUNT) return { uid: null };

  let projectId = null;
  try {
    projectId = JSON.parse(workerEnv.FIREBASE_SERVICE_ACCOUNT).project_id;
  } catch {
    return { uid: null };
  }
  if (!projectId) return { uid: null };

  const claims = await verifyFirebaseIdToken(match[1], projectId);
  if (!claims) return { uid: null };
  if (claims.firebase?.sign_in_provider === "anonymous") return { uid: null };
  return { uid: claims.sub };
}
