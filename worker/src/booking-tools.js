// Guest booking tools for the concierge chat, executed server-side so the
// model never sees the browser's permissions and one user message stays one
// rate-limit count. Read-only by design: availability + quotes only, the
// booking itself is still created by the normal BookingPage flow.
//
// Rules mirrored from the client (keep in sync):
//   - bookable room: isActive !== false          (src/services/roomsService.js)
//   - occupied night: ANY room_availability marker with a date in
//     [checkIn, checkOut)                        (src/services/availabilityService.js
//     getBlockedRoomIds — the guest-facing pre-check blocks whatever the
//     marker's status is; the hourly orphan sweep clears stale terminal ones)
//   - capacity + pricing                          (src/lib/roomCapacity.js)
import { getGoogleAccessToken } from "./google-auth.js";
import { getFirestoreDoc, runFirestoreQuery, fsValue } from "./firestore.js";

const MAX_NIGHTS = 30;
const MAX_PAX = 20;
const MAX_ROOMS_IN_RESULT = 12;

const ROOM_TYPE_CAPACITY_DEFAULTS = {
  "Single Room": { basePax: 1, maxPax: 2, extraPaxFee: 300 },
  "Suite Room": { basePax: 2, maxPax: 4, extraPaxFee: 500 },
  "Presidential Room": { basePax: 4, maxPax: 8, extraPaxFee: 1000 },
};

const GENERIC_CAPACITY = { basePax: 2, maxPax: 4, extraPaxFee: 500 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GUEST_TOOLS = [
  {
    type: "function",
    function: {
      name: "find_rooms",
      description:
        "Check which rooms are available for a date range. Returns only rooms that are active and free for every night from checkIn up to (not including) checkOut. Use real dates in YYYY-MM-DD format.",
      parameters: {
        type: "object",
        properties: {
          checkIn: { type: "string", description: "Check-in date, YYYY-MM-DD" },
          checkOut: { type: "string", description: "Check-out date, YYYY-MM-DD" },
          roomType: {
            type: "string",
            description: "Optional room type filter, e.g. Single Room, Suite Room, Presidential Room",
          },
          pax: {
            type: "integer",
            minimum: 1,
            maximum: MAX_PAX,
            description: "Number of guests, when known",
          },
        },
        required: ["checkIn", "checkOut"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_booking",
      description:
        "Compute the exact price for one room and stay, including extra-guest fees. Fails if the room is unavailable for any night or the guest count exceeds the room maximum. Use the numbers it returns, never do the math yourself.",
      parameters: {
        type: "object",
        properties: {
          roomId: { type: "string", description: "Room id from find_rooms" },
          checkIn: { type: "string", description: "Check-in date, YYYY-MM-DD" },
          checkOut: { type: "string", description: "Check-out date, YYYY-MM-DD" },
          pax: { type: "integer", minimum: 1, maximum: MAX_PAX, description: "Number of guests" },
        },
        required: ["roomId", "checkIn", "checkOut", "pax"],
      },
    },
  },
];

/** UTC ms for a validated YYYY-MM-DD date, or null. */
function parseDateOnly(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/** Today's date in the hotel's timezone (Asia/Manila, fixed UTC+8, no DST). */
export function todayKey() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Validate a stay request. Returns { checkIn, checkOut, nights } or { error }. */
function validateStay(checkIn, checkOut) {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (start == null || end == null) {
    return { error: "Dates must be real calendar dates in YYYY-MM-DD format. If the guest has not given the dates yet, ask for them first." };
  }
  if (end <= start) {
    return { error: "Check-out must be after check-in." };
  }
  const nights = Math.round((end - start) / 86400000);
  if (nights > MAX_NIGHTS) {
    return { error: `Stays longer than ${MAX_NIGHTS} nights are not supported here.` };
  }
  if (checkIn < todayKey()) {
    return { error: "Check-in cannot be in the past." };
  }
  return { checkIn, checkOut, nights };
}

function validatePax(pax) {
  const n = Number(pax);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAX) {
    return { error: `Guest count must be a whole number between 1 and ${MAX_PAX}. If the guest has not given a guest count yet, ask for it first.` };
  }
  return { pax: n };
}

/** Mirror of src/lib/roomCapacity.js getRoomCapacity. */
function roomCapacity(fields) {
  const type = fsValue(fields, "type") || "";
  const defaults = ROOM_TYPE_CAPACITY_DEFAULTS[type] || GENERIC_CAPACITY;
  const pick = (key) => {
    const v = Number(fsValue(fields, key));
    return Number.isFinite(v) ? v : defaults[key];
  };
  return { basePax: pick("basePax"), maxPax: pick("maxPax"), extraPaxFee: pick("extraPaxFee") };
}

function amenityList(fields) {
  const values = fields?.amenities?.arrayValue?.values;
  if (!Array.isArray(values)) return [];
  return values.map((v) => v?.stringValue).filter(Boolean);
}

/** Write { error } results as the tool's answer; the model relays them. */
function errorResult(message, extra = {}) {
  return { error: message, ...extra };
}

async function firestoreContext(workerEnv) {
  let projectId;
  try {
    projectId = JSON.parse(workerEnv?.FIREBASE_SERVICE_ACCOUNT || "").project_id;
  } catch {
    projectId = null;
  }
  if (!projectId) {
    return { error: "Booking lookup is not configured right now." };
  }
  try {
    const accessToken = await getGoogleAccessToken(workerEnv.FIREBASE_SERVICE_ACCOUNT);
    return { accessToken, projectId };
  } catch {
    return { error: "Booking lookup is temporarily unavailable." };
  }
}

/**
 * Room ids with at least one marker in [checkIn, checkOut) — one range query,
 * the same read the guest-facing pre-check performs (getBlockedRoomIds).
 * Any marker counts, whatever its status.
 */
async function fetchBlockedRoomIds(accessToken, projectId, checkIn, checkOut) {
  const markerDocs = await runFirestoreQuery(accessToken, projectId, "room_availability", {
    from: [{ collectionId: "room_availability" }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "date" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { stringValue: checkIn },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: "date" },
              op: "LESS_THAN",
              value: { stringValue: checkOut },
            },
          },
        ],
      },
    },
  });
  const blocked = new Set();
  for (const marker of markerDocs) {
    const roomId = fsValue(marker.fields, "roomId");
    if (roomId) blocked.add(roomId);
  }
  return blocked;
}

async function findRooms(args, workerEnv) {
  const stay = validateStay(args?.checkIn, args?.checkOut);
  if (stay.error) return errorResult(stay.error);

  let pax = null;
  if (args?.pax != null) {
    const paxCheck = validatePax(args.pax);
    if (paxCheck.error) return errorResult(paxCheck.error);
    pax = paxCheck.pax;
  }
  const roomType = typeof args?.roomType === "string" ? args.roomType.trim().toLowerCase() : "";

  const ctx = await firestoreContext(workerEnv);
  if (ctx.error) return errorResult(ctx.error);

  const [roomDocs, blocked] = await Promise.all([
    runFirestoreQuery(ctx.accessToken, ctx.projectId, "rooms", {
      from: [{ collectionId: "rooms" }],
    }),
    fetchBlockedRoomIds(ctx.accessToken, ctx.projectId, stay.checkIn, stay.checkOut),
  ]);

  const rooms = [];
  for (const doc of roomDocs) {
    if (fsValue(doc.fields, "isActive") === false) continue;
    if (roomType && !String(fsValue(doc.fields, "type") || "").toLowerCase().includes(roomType)) {
      continue;
    }
    if (blocked.has(doc.id)) continue;
    const capacity = roomCapacity(doc.fields);
    rooms.push({
      roomId: doc.id,
      name: fsValue(doc.fields, "name") || `Room ${doc.id}`,
      type: fsValue(doc.fields, "type") || "—",
      ratePerNight: Number(fsValue(doc.fields, "ratePerNight")) || 0,
      ...capacity,
      amenities: amenityList(doc.fields),
      fitsPax: pax == null ? null : pax <= capacity.maxPax,
    });
  }

  // Guests with a guest count should see rooms that fit them first when the
  // list is truncated.
  if (pax != null) rooms.sort((a, b) => Number(b.fitsPax) - Number(a.fitsPax));

  return {
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    nights: stay.nights,
    pax,
    roomType: args?.roomType || null,
    totalAvailable: rooms.length,
    rooms: rooms.slice(0, MAX_ROOMS_IN_RESULT),
  };
}

async function quoteBooking(args, workerEnv) {
  if (typeof args?.roomId !== "string" || !args.roomId || args.roomId.length > 256) {
    return errorResult("A room id from find_rooms is required.");
  }
  const stay = validateStay(args?.checkIn, args?.checkOut);
  if (stay.error) return errorResult(stay.error);
  const paxCheck = validatePax(args?.pax);
  if (paxCheck.error) return errorResult(paxCheck.error);
  const pax = paxCheck.pax;

  const ctx = await firestoreContext(workerEnv);
  if (ctx.error) return errorResult(ctx.error);

  const [room, blocked] = await Promise.all([
    getFirestoreDoc(ctx.accessToken, ctx.projectId, "rooms", args.roomId),
    fetchBlockedRoomIds(ctx.accessToken, ctx.projectId, stay.checkIn, stay.checkOut),
  ]);
  if (!room.exists || fsValue(room.fields, "isActive") === false) {
    return errorResult("That room is no longer available.");
  }

  const capacity = roomCapacity(room.fields);
  if (pax > capacity.maxPax) {
    return errorResult(
      `That room accommodates a maximum of ${capacity.maxPax} guests.`,
      { maxPax: capacity.maxPax, basePax: capacity.basePax },
    );
  }

  if (blocked.has(args.roomId)) {
    return errorResult("That room is no longer available for those dates.");
  }

  // Mirror of calculateBookingPricing (src/lib/roomCapacity.js).
  const ratePerNight = Number(fsValue(room.fields, "ratePerNight")) || 0;
  const extraPaxCount = Math.max(0, pax - capacity.basePax);
  const baseTotal = ratePerNight * stay.nights;
  const extraPaxTotal = extraPaxCount * capacity.extraPaxFee * stay.nights;

  return {
    roomId: args.roomId,
    roomName: fsValue(room.fields, "name") || `Room ${args.roomId}`,
    type: fsValue(room.fields, "type") || "—",
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    nights: stay.nights,
    pax,
    ratePerNight,
    basePax: capacity.basePax,
    maxPax: capacity.maxPax,
    extraPaxCount,
    extraPaxFee: capacity.extraPaxFee,
    baseTotal,
    extraPaxTotal,
    totalCost: baseTotal + extraPaxTotal,
  };
}

/**
 * Run one guest tool call. Never throws: every failure becomes an { error }
 * result the model can relay, so the chat stays alive.
 */
export async function executeGuestTool(name, args, workerEnv) {
  try {
    if (name === "find_rooms") return await findRooms(args, workerEnv);
    if (name === "quote_booking") return await quoteBooking(args, workerEnv);
    return errorResult(`Unknown tool: ${String(name)}`);
  } catch (e) {
    console.error(`[booking-tools] ${name} failed:`, String(e?.message || e));
    return errorResult("Booking lookup failed. Please try again in a moment.");
  }
}
