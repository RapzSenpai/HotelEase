// Moved verbatim from src/index.js — Google OAuth helpers, no logic changes.
// ===========================================================================
// Firebase Admin-style helpers (service account via Google OAuth)
// =========================================================================

function base64urlEncodeBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncodeText(text) {
  return base64urlEncodeBytes(new TextEncoder().encode(text));
}

async function importPrivateKey(pem) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Sign a Google service-account JWT (RS256) and swap it for an OAuth2 access
 * token covering Firebase + Firestore admin scopes.
 */
export async function getGoogleAccessToken(rawServiceAccount) {
  const sa = JSON.parse(rawServiceAccount);
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncodeText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64urlEncodeText(
    JSON.stringify({
      iss: sa.client_email,
      scope:
        "https://www.googleapis.com/auth/firebase " +
        "https://www.googleapis.com/auth/cloud-platform " +
        "https://www.googleapis.com/auth/datastore",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64urlEncodeBytes(new Uint8Array(signature))}`;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(
      "Failed to exchange service-account JWT for access token: " +
        (data?.error_description || data?.error || resp.status),
    );
  }
  return data.access_token;
}
