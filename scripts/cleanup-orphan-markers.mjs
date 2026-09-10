#!/usr/bin/env node
/**
 * One-off cleanup: delete `room_availability` markers whose linked booking is
 * Cancelled or no longer exists. These orphan markers permanently block
 * nights — guests see "No rooms available" even though nothing active holds
 * the room. Pre-fix rejections and expired holds (before the rejectBooking fix
 * and the hourly worker sweep) left exactly this kind of marker behind.
 *
 * Uses the same service-account → Firestore REST pattern as the Cloudflare
 * worker (worker/src/index.js). No new dependencies; requires Node 18+.
 *
 * Usage:
 *   node scripts/cleanup-orphan-markers.mjs                          # DRY RUN
 *   node scripts/cleanup-orphan-markers.mjs --apply                  # delete for real
 *   node scripts/cleanup-orphan-markers.mjs --service-account path/to/sa.json --apply
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/cleanup-orphan-markers.mjs --apply
 *
 * Flags:
 *   --service-account <path>  Path to the service-account JSON. Defaults to the
 *                             FIREBASE_SERVICE_ACCOUNT env var, then to
 *                             secure_folder/*-firebase-adminsdk-*.json.
 *   --apply                   Actually delete orphan markers (default: dry run).
 *   --include-checked-out     Also treat markers whose booking is "Checked Out"
 *                             as orphans (should only exist from pre-fix data —
 *                             checkOutBooking clears markers nowadays).
 *   --verbose                 Print every marker considered, not just orphans.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};

const APPLY = flag("--apply");
const INCLUDE_CHECKED_OUT = flag("--include-checked-out");
const VERBOSE = flag("--verbose");

// ---------------------------------------------------------------------------
// Service account resolution
// ---------------------------------------------------------------------------
function resolveServiceAccount() {
  const fromFlag = value("--service-account");
  if (fromFlag) {
    return JSON.parse(readFileSync(resolve(fromFlag), "utf8"));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  const secureDir = resolve("secure_folder");
  try {
    const match = readdirSync(secureDir).find(
      (f) => f.includes("-firebase-adminsdk-") && f.endsWith(".json"),
    );
    if (match) return JSON.parse(readFileSync(join(secureDir, match), "utf8"));
  } catch {
    // no secure_folder — fall through to the error below
  }
  throw new Error(
    "No service account found. Pass --service-account <path>, set the " +
      "FIREBASE_SERVICE_ACCOUNT env var, or drop a *-firebase-adminsdk-*.json " +
      "file into secure_folder/.",
  );
}

// ---------------------------------------------------------------------------
// Google OAuth (service-account JWT → access token) — mirrors the worker
// ---------------------------------------------------------------------------
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
async function getGoogleAccessToken(sa) {
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
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
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

// ---------------------------------------------------------------------------
// Firestore REST helpers
// ---------------------------------------------------------------------------
const FS_BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function runFirestoreQuery(accessToken, projectId, collectionId) {
  const resp = await fetch(`${FS_BASE(projectId)}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`runQuery ${collectionId} failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const results = await resp.json().catch(() => []);
  return (Array.isArray(results) ? results : [])
    .filter((r) => r?.document)
    .map((r) => {
      const name = r.document.name || "";
      return {
        id: name.split("/").pop() || "",
        fields: r.document.fields || {},
      };
    });
}

/** GET one doc; returns { exists, fields } (404 → exists:false). */
async function getDocument(accessToken, projectId, collectionId, docId) {
  const resp = await fetch(
    `${FS_BASE(projectId)}/${collectionId}/${encodeURIComponent(docId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (resp.status === 404) return { exists: false, fields: {} };
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`GET ${collectionId}/${docId} failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  return { exists: true, fields: data.fields || {} };
}

async function deleteFirestoreDoc(accessToken, projectId, collectionId, docId) {
  const resp = await fetch(`${FS_BASE(projectId)}/${collectionId}/${encodeURIComponent(docId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => "");
    throw new Error(`DELETE ${collectionId}/${docId} failed (${resp.status}): ${text.slice(0, 300)}`);
  }
}

const str = (fields, path) => fields?.[path]?.stringValue ?? null;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const sa = resolveServiceAccount();
  const projectId = sa.project_id;
  if (!projectId) throw new Error("Service account is missing project_id.");

  const accessToken = await getGoogleAccessToken(sa);
  console.log(`Project: ${projectId}`);
  console.log(`Mode: ${APPLY ? "APPLY (deletes for real)" : "DRY RUN (no changes)"}`);
  if (INCLUDE_CHECKED_OUT) console.log("Including 'Checked Out' bookings as orphans.");

  // 1. Read every availability marker.
  const markers = await runFirestoreQuery(accessToken, projectId, "room_availability");
  console.log(`\nroom_availability markers found: ${markers.length}`);

  // 2. Group markers by the booking they reference.
  const byBooking = new Map(); // bookingId -> marker[]
  const unlinked = []; // marker has no usable bookingId
  for (const m of markers) {
    const bid = str(m.fields, "bookingId");
    if (!bid) {
      unlinked.push(m);
      continue;
    }
    if (!byBooking.has(bid)) byBooking.set(bid, []);
    byBooking.get(bid).push(m);
  }

  // 3. Classify each referenced booking as active or orphan.
  const orphanMarkers = []; // { markerId, roomId, date, bookingId, reason }
  const activeBookingIds = new Set();
  const bookingInfo = new Map(); // bookingId -> { status, checkIn, checkOut } (verbose)
  let missingBookings = 0;
  let cancelledBookings = 0;
  let checkedOutBookings = 0;

  for (const [bookingId, bookingMarkers] of byBooking) {
    const { exists, fields } = await getDocument(accessToken, projectId, "bookings", bookingId);
    let reason = null;
    if (!exists) {
      reason = "booking_missing";
      missingBookings += 1;
    } else {
      const status = str(fields, "status");
      bookingInfo.set(bookingId, {
        status,
        checkIn: fields?.checkInDate?.timestampValue ?? null,
        checkOut: fields?.checkOutDate?.timestampValue ?? null,
      });
      if (status === "Cancelled") {
        reason = "cancelled";
        cancelledBookings += 1;
      } else if (INCLUDE_CHECKED_OUT && status === "Checked Out") {
        reason = "checked_out";
        checkedOutBookings += 1;
      }
    }

    if (reason) {
      for (const m of bookingMarkers) {
        orphanMarkers.push({
          markerId: m.id,
          roomId: str(m.fields, "roomId"),
          date: str(m.fields, "date"),
          bookingId,
          reason,
        });
      }
    } else {
      activeBookingIds.add(bookingId);
    }
  }

  // Markers with no bookingId can never belong to an active booking → orphan.
  for (const m of unlinked) {
    orphanMarkers.push({
      markerId: m.id,
      roomId: str(m.fields, "roomId"),
      date: str(m.fields, "date"),
      bookingId: null,
      reason: "unlinked",
    });
  }

  const orphanCount = orphanMarkers.length;
  const activeMarkerCount = markers.length - orphanCount;

  console.log(`Referenced bookings: ${byBooking.size} (${missingBookings} missing, ${cancelledBookings} cancelled, ${checkedOutBookings} checked out, ${activeBookingIds.size} active)`);
  console.log(`Markers to keep (active bookings): ${activeMarkerCount}`);
  console.log(`ORPHAN markers (${orphanCount}) — ${APPLY ? "will be deleted" : "would be deleted"}:`);

  if (VERBOSE) {
    for (const o of orphanMarkers) {
      console.log(
        `  ${o.markerId}  room=${o.roomId}  date=${o.date}  booking=${o.bookingId ?? "(none)"}  reason=${o.reason}`,
      );
    }
  } else {
    const shown = orphanMarkers.slice(0, 20);
    for (const o of shown) {
      console.log(
        `  ${o.markerId}  room=${o.roomId}  date=${o.date}  booking=${o.bookingId ?? "(none)"}  reason=${o.reason}`,
      );
    }
    if (orphanMarkers.length > shown.length) {
      console.log(`  … and ${orphanMarkers.length - shown.length} more (use --verbose to list all)`);
    }
  }

  if (VERBOSE) {
    console.log("\nMarkers kept (active bookings):");
    for (const [bookingId, bookingMarkers] of byBooking) {
      if (activeBookingIds.has(bookingId)) {
        const info = bookingInfo.get(bookingId);
        const range = info
          ? `status=${info.status} checkIn=${info.checkIn ?? "?"} checkOut=${info.checkOut ?? "?"}`
          : "status=?";
        console.log(`  booking=${bookingId}  (${range})`);
        for (const m of bookingMarkers) {
          console.log(`    ${m.id}  room=${str(m.fields, "roomId")}  date=${str(m.fields, "date")}`);
        }
      }
    }
  }

  if (orphanCount === 0) {
    console.log("\nNothing to clean up. 🎉");
    return;
  }

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply to delete these markers.");
    return;
  }

  // 4. Delete, with a small concurrency so large cleanups don't hammer Firestore.
  const CONCURRENCY = 10;
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < orphanMarkers.length; i += CONCURRENCY) {
    const batch = orphanMarkers.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (o) => {
        try {
          await deleteFirestoreDoc(accessToken, projectId, "room_availability", o.markerId);
          deleted += 1;
        } catch (e) {
          failed += 1;
          console.error(`  ✗ failed to delete ${o.markerId}:`, String(e?.message || e));
        }
      }),
    );
  }

  console.log(`\nDone: ${deleted} orphan markers deleted, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Cleanup failed:", String(e?.message || e));
  process.exit(1);
});