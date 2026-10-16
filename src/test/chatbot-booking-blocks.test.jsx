import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  parseStructuredBlock,
  RoomsBlock,
  BookingSummaryBlock,
  buildBookingPath,
} from "@/components/chatbot/bookingBlocks";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
let container = null;

function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return container;
}

function click(node) {
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function buttonByText(element, text) {
  return [...element.querySelectorAll("button")].find((b) =>
    b.textContent.toLowerCase().includes(text.toLowerCase()));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

const roomsBlockJson = JSON.stringify({
  checkIn: "2026-12-20",
  checkOut: "2026-12-22",
  nights: 2,
  rooms: [
    {
      roomId: "r1",
      name: "Sunset Suite",
      type: "Suite Room",
      ratePerNight: 2500,
      basePax: 2,
      maxPax: 4,
      extraPaxFee: 500,
      amenities: ["Wi-Fi", "AC"],
    },
  ],
});

const summaryBlockJson = JSON.stringify({
  roomId: "r1",
  roomName: "Sunset Suite",
  checkIn: "2026-12-20",
  checkOut: "2026-12-22",
  nights: 2,
  pax: 4,
  ratePerNight: 2500,
  extraPaxCount: 2,
  extraPaxFee: 500,
  extraPaxTotal: 2000,
  totalCost: 7000,
});

describe("parseStructuredBlock", () => {
  it("parses a valid rooms block, tolerating react-markdown's trailing newline", () => {
    const parsed = parseStructuredBlock("language-rooms", `${roomsBlockJson}\n`);
    expect(parsed?.type).toBe("rooms");
    expect(parsed?.data.rooms[0].roomId).toBe("r1");
  });

  it("parses a valid booking-summary block", () => {
    const parsed = parseStructuredBlock("language-booking-summary", summaryBlockJson);
    expect(parsed?.type).toBe("booking-summary");
    expect(parsed?.data.totalCost).toBe(7000);
  });

  it("returns null for malformed JSON so callers can fall back to plain text", () => {
    expect(parseStructuredBlock("language-rooms", "{not json")).toBeNull();
  });

  it("returns null for unknown languages and inline code", () => {
    expect(parseStructuredBlock("language-chart", '{"type":"bar"}')).toBeNull();
    expect(parseStructuredBlock(undefined, "plain text")).toBeNull();
  });

  it("returns null when the JSON is valid but the shape is wrong", () => {
    expect(parseStructuredBlock("language-rooms", '{"foo":1}')).toBeNull();
    expect(parseStructuredBlock("language-booking-summary", '{"rooms":[]}')).toBeNull();
  });

  it("returns null when payload fields are the wrong type or rooms hold junk", () => {
    expect(parseStructuredBlock("language-rooms", '{"rooms":[null]}')).toBeNull();
    expect(parseStructuredBlock("language-rooms", '{"rooms":["r1"]}')).toBeNull();
    expect(parseStructuredBlock("language-rooms", '{"rooms":[{"roomId":42}]}')).toBeNull();
    expect(parseStructuredBlock("language-rooms", '{"rooms":[{"roomId":"r1","name":{}}]}')).toBeNull();
    expect(
      parseStructuredBlock(
        "language-booking-summary",
        JSON.stringify({ ...JSON.parse(summaryBlockJson), totalCost: "7000" }),
      ),
    ).toBeNull();
    expect(
      parseStructuredBlock(
        "language-booking-summary",
        JSON.stringify({ ...JSON.parse(summaryBlockJson), roomName: { x: 1 } }),
      ),
    ).toBeNull();
  });

  it("returns null when a rendered scalar would be an object (React child crash)", () => {
    const baseRoom = { roomId: "r1", name: "A", type: "Suite Room", maxPax: 4 };
    const rooms = (extra) =>
      JSON.stringify({ nights: 2, rooms: [{ ...baseRoom, ...extra }] });

    expect(parseStructuredBlock("language-rooms", rooms({ type: {} }))).toBeNull();
    expect(parseStructuredBlock("language-rooms", rooms({ maxPax: {} }))).toBeNull();
    expect(
      parseStructuredBlock(
        "language-rooms",
        JSON.stringify({ nights: {}, rooms: [baseRoom] }),
      ),
    ).toBeNull();
    expect(
      parseStructuredBlock(
        "language-booking-summary",
        JSON.stringify({ ...JSON.parse(summaryBlockJson), pax: {} }),
      ),
    ).toBeNull();
    expect(
      parseStructuredBlock(
        "language-booking-summary",
        JSON.stringify({ ...JSON.parse(summaryBlockJson), nights: {} }),
      ),
    ).toBeNull();
  });
});

describe("parseStructuredBlock tolerance", () => {
  // The exact payload the model emitted in production (2026-10-17 -> 2026-10-20).
  const realRoomsPayload =
    '{"checkIn":"2026-10-17","checkOut":"2026-10-20","nights":3,"rooms":[{"roomId":"0YubWaeBhLzCtiEojbHF","name":"Cozy Family Room","type":"Family Room","ratePerNight":898,"basePax":2,"maxPax":5,"extraPaxFee":499,"amenities":["Wifi","Air Conditioning","TV","Balcony"]},{"roomId":"7qxG70SQNxhxvIjK5UTn","name":"Sakura Room","type":"Suite Room","ratePerNight":4999,"basePax":2,"maxPax":4,"extraPaxFee":500,"amenities":["Acupuncture set","Sakura Tree bonsai"]}]}';

  it("parses the exact production payload", () => {
    const parsed = parseStructuredBlock("language-rooms", realRoomsPayload);
    expect(parsed?.type).toBe("rooms");
    expect(parsed?.data.rooms).toHaveLength(2);
    expect(parsed?.data.rooms[0].roomId).toBe("0YubWaeBhLzCtiEojbHF");
  });

  it("normalizes the tag's case and whitespace", () => {
    expect(parseStructuredBlock("language-Rooms", realRoomsPayload)?.type).toBe("rooms");
    expect(parseStructuredBlock("  LANGUAGE-ROOMS  ", realRoomsPayload)?.type).toBe("rooms");
  });

  it("detects a room block by shape behind a json or missing tag", () => {
    expect(parseStructuredBlock("language-json", realRoomsPayload)?.type).toBe("rooms");
    expect(parseStructuredBlock(undefined, realRoomsPayload)?.type).toBe("rooms");
  });

  it("detects a summary block by shape behind a json or missing tag", () => {
    expect(parseStructuredBlock("language-json", summaryBlockJson)?.type).toBe("booking-summary");
    expect(parseStructuredBlock(undefined, summaryBlockJson)?.type).toBe("booking-summary");
  });

  it("parses JSON wrapped in prose inside the fence", () => {
    const noisy = `Here are the rooms:\n${roomsBlockJson}\nLet me know which one you like!`;
    expect(parseStructuredBlock("language-rooms", noisy)?.type).toBe("rooms");
    expect(parseStructuredBlock("language-json", noisy)?.type).toBe("rooms");
  });

  it("still returns null for json-tagged blocks that are not one of our blocks", () => {
    expect(parseStructuredBlock("language-json", '{"unrelated":true}')).toBeNull();
  });

  it("still returns null for truncated JSON", () => {
    expect(parseStructuredBlock("language-rooms", roomsBlockJson.slice(0, 60))).toBeNull();
  });

  it("keeps the declared tag authoritative when the shape disagrees", () => {
    expect(parseStructuredBlock("language-rooms", summaryBlockJson)).toBeNull();
    expect(parseStructuredBlock("language-booking-summary", roomsBlockJson)).toBeNull();
  });
});

describe("RoomsBlock", () => {
  it("shows room facts and sends a selection message on click", () => {
    const onSelect = vi.fn();
    const element = render(
      createElement(RoomsBlock, { data: JSON.parse(roomsBlockJson), onSelect }),
    );

    expect(element.textContent).toContain("Sunset Suite");
    expect(element.textContent).toContain("Sleeps up to 4");
    expect(element.textContent).toContain("PHP 2,500.00");
    expect(element.textContent).toContain("Dec 20 → Dec 22");

    click(buttonByText(element, "select"));
    expect(onSelect).toHaveBeenCalledWith("I'll take the Sunset Suite.");
  });

  it("says so when no rooms are available for the dates", () => {
    const element = render(
      createElement(RoomsBlock, {
        data: { checkIn: "2026-12-20", checkOut: "2026-12-22", nights: 2, rooms: [] },
        onSelect: vi.fn(),
      }),
    );
    expect(element.textContent).toMatch(/No rooms available/i);
  });
});

describe("buildBookingPath", () => {
  it("builds the deep link the BookingPage already understands, with pax", () => {
    expect(
      buildBookingPath({
        roomId: "r1",
        checkIn: "2026-12-20",
        checkOut: "2026-12-22",
        pax: 4,
      }),
    ).toBe("/booking/r1?checkIn=2026-12-20&checkOut=2026-12-22&pax=4");
  });

  it("clamps a missing or nonsense pax to 1 instead of emitting NaN", () => {
    expect(
      buildBookingPath({ roomId: "r1", checkIn: "2026-12-20", checkOut: "2026-12-22" }),
    ).toContain("pax=1");
    expect(
      buildBookingPath({ roomId: "r1", checkIn: "2026-12-20", checkOut: "2026-12-22", pax: "x" }),
    ).toContain("pax=1");
  });

  it("encodes model-supplied room ids so they can't steer the route", () => {
    expect(
      buildBookingPath({
        roomId: "../../admin",
        checkIn: "2026-12-20",
        checkOut: "2026-12-22",
        pax: 1,
      }),
    ).toBe("/booking/..%2F..%2Fadmin?checkIn=2026-12-20&checkOut=2026-12-22&pax=1");
  });
});

describe("BookingSummaryBlock", () => {  it("renders the quote and books when signed in", () => {
    const onBook = vi.fn();
    const element = render(
      createElement(BookingSummaryBlock, {
        data: JSON.parse(summaryBlockJson),
        signedIn: true,
        onBook,
      }),
    );

    expect(element.textContent).toContain("Sunset Suite");
    expect(element.textContent).toContain("Dec 20");
    expect(element.textContent).toContain("PHP 7,000.00");
    expect(element.textContent).toContain("4 guests");

    click(buttonByText(element, "Book Now"));
    expect(onBook).toHaveBeenCalledWith(JSON.parse(summaryBlockJson));
  });

  it("asks signed-out guests to sign in first", () => {
    const onBook = vi.fn();
    const element = render(
      createElement(BookingSummaryBlock, {
        data: JSON.parse(summaryBlockJson),
        signedIn: false,
        onBook,
      }),
    );

    click(buttonByText(element, "Sign in to book"));
    expect(onBook).toHaveBeenCalled();
  });
});
