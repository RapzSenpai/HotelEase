/* eslint-disable react-refresh/only-export-components -- block parser + path builder live with their renderers by design */
// Interactive renderers for the concierge's fenced booking blocks. Plain JSON
// in, styled cards out — malformed or unexpected payloads return null so the
// widget falls back to showing the raw code block (never a crash). The fence
// tag is normalized and, for a bare or ```json fence, ignored in favor of the
// payload's strictly validated shape — the model slips on tags sometimes.
import { CalendarDays, Users } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const BLOCK_TYPES = {
  "language-rooms": "rooms",
  "language-booking-summary": "booking-summary"};

// Fences with no tag (or a generic ```json) may still be one of our blocks.
const FUZZY_BLOCK_TAGS = new Set(["", "language-json"]);

/** "Dec 20" for a YYYY-MM-DD string, timezone-proof. */
function formatDay(iso) {
  if (typeof iso !== "string") return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"});
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Strict shape checks — the trust boundary before a block becomes a card. */
function isRoomsData(data) {
  if (!Array.isArray(data.rooms) || typeof data.nights !== "number") return false;
  return data.rooms.every(
    (room) =>
      isPlainObject(room) &&
      typeof room.roomId === "string" &&
      typeof room.name === "string" &&
      typeof room.type === "string" &&
      typeof room.maxPax === "number",
  );
}

function isBookingSummaryData(data) {
  return (
    typeof data.roomId === "string" &&
    typeof data.roomName === "string" &&
    typeof data.totalCost === "number" &&
    typeof data.nights === "number" &&
    typeof data.pax === "number"
  );
}

/** JSON.parse with one retry that trims prose around the JSON inside a fence. */
function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return undefined;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

export function parseStructuredBlock(className, raw) {
  const tag = String(className || "").trim().toLowerCase();
  const declared = BLOCK_TYPES[tag];
  const fuzzy = !declared && FUZZY_BLOCK_TAGS.has(tag);
  if (!declared && !fuzzy) return null;

  const data = parseJsonLoose(String(raw ?? "").trim());
  if (!isPlainObject(data)) return null;

  // A declared tag stays authoritative for its own type; the shape check only
  // decides when the tag is missing or generic.
  if (declared === "rooms" && isRoomsData(data)) return { type: "rooms", data };
  if (declared === "booking-summary" && isBookingSummaryData(data)) {
    return { type: "booking-summary", data };
  }
  if (fuzzy) {
    if (isRoomsData(data)) return { type: "rooms", data };
    if (isBookingSummaryData(data)) return { type: "booking-summary", data };
  }
  return null;
}

/** Deep link into the existing BookingPage flow. Query params mirror what
 * BookingPage already reads (checkIn/checkOut) plus pax. */
export function buildBookingPath(data) {
  // Encode the model-supplied id so stray slashes cannot steer the route.
  const roomId = encodeURIComponent(String(data?.roomId || ""));
  const checkIn = encodeURIComponent(String(data?.checkIn || ""));
  const checkOut = encodeURIComponent(String(data?.checkOut || ""));
  const pax = Math.max(1, Math.floor(Number(data?.pax)) || 1);
  return `/booking/${roomId}?checkIn=${checkIn}&checkOut=${checkOut}&pax=${pax}`;
}

export function RoomsBlock({ data, onSelect }) {
  const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
  const dateLine = `${formatDay(data?.checkIn)} → ${formatDay(data?.checkOut)}`;

  if (rooms.length === 0) {
    return (
      <div className="my-2 rounded-xl border border-border bg-background p-3 text-xs text-foreground/70">
        No rooms available for {dateLine}. Try different dates.
      </div>
    );
  }

  return (
    <div className="my-2 space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/60">
        <CalendarDays className="h-3.5 w-3.5" />
        {dateLine} · {data?.nights} night{data?.nights === 1 ? "" : "s"}
      </p>
      {rooms.map((room) => (
        <div key={room.roomId} className="rounded-xl border border-border bg-background p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{room.name}</p>
              <p className="text-xs text-foreground/60">
                {room.type} · Sleeps up to {room.maxPax} · Extra guest {formatCurrency(room.extraPaxFee)}/night
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-foreground">
              {formatCurrency(room.ratePerNight)}
              <span className="text-xs font-normal text-foreground/60">/night</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelect?.(`I'll take the ${room.name}.`)}
            className="mt-2 h-7 rounded-lg border border-primary px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Select
          </button>
        </div>
      ))}
    </div>
  );
}

export function BookingSummaryBlock({ data, signedIn, onBook }) {
  return (
    <div className="my-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-semibold text-foreground">{data?.roomName}</p>
      <div className="mt-1.5 space-y-0.5 text-xs text-foreground/70">
        <p className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDay(data?.checkIn)} → {formatDay(data?.checkOut)} · {data?.nights} night
          {data?.nights === 1 ? "" : "s"}
        </p>
        <p className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {data?.pax} guest{data?.pax === 1 ? "" : "s"}
        </p>
        <p>
          {formatCurrency(data?.ratePerNight)} × {data?.nights} night{data?.nights === 1 ? "" : "s"}
        </p>
        {data?.extraPaxCount > 0 && (
          <p>
            Extra guest fee: {formatCurrency(data?.extraPaxFee)} × {data?.extraPaxCount} ×{" "}
            {data?.nights} night{data?.nights === 1 ? "" : "s"} = {formatCurrency(data?.extraPaxTotal)}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-primary/20 pt-2">
        <span className="text-xs font-medium text-foreground/70">Total</span>
        <span className="text-sm font-bold text-foreground">{formatCurrency(data?.totalCost)}</span>
      </div>
      <button
        type="button"
        onClick={() => onBook?.(data)}
        className="mt-2 h-8 w-full rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.99]"
      >
        {signedIn ? "Book Now" : "Sign in to book"}
      </button>
    </div>
  );
}
