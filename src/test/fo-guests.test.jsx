import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Services the FO guests page talks to. firestore itself is untouched by the
// page — data flows through these modules only.
vi.mock("@/services/userService", () => ({
  listGuests: vi.fn(),
  getUserDoc: vi.fn(),
  addGuestCrmNote: vi.fn(async () => ({ ok: true })),
  listGuestCrmNotes: vi.fn()}));
vi.mock("@/services/bookingsService", () => ({
  listBookingsForUser: vi.fn()}));
vi.mock("@/services/roomsService", () => ({
  listRooms: vi.fn()}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => open ? children : null,
  DialogContent: ({ children }) => createElement("div", null, children),
  DialogHeader: ({ children }) => createElement("div", null, children),
  DialogTitle: ({ children }) => createElement("h2", null, children),
  DialogDescription: ({ children }) => createElement("p", null, children)}));

const { default: FoGuestsPage } = await import("@/pages/fo/FoGuestsPage");
const { listGuests, getUserDoc, addGuestCrmNote, listGuestCrmNotes } = await import("@/services/userService");
const { listBookingsForUser } = await import("@/services/bookingsService");
const { listRooms } = await import("@/services/roomsService");

let root = null;
let container = null;

const GUESTS = [
  { id: "g-1", fullName: "Juan Dela Cruz", email: "juan@hotelease.ph", phone: "0917 000 1111", role: "guest" },
  { id: "g-2", fullName: "Maria Santos", email: "maria@hotelease.ph", phone: "", role: "guest" }];

const DOC = {
  ...GUESTS[0],
  crmNotes: [
    { note: "Prefers high floor", byEmail: "fo-1@hotelease.ph", at: "2026-10-21T20:00:00.000Z" },
    { note: "Repeat guest — reliable payer", byEmail: "fo-1@hotelease.ph", at: "2026-10-01T20:00:00.000Z" }]};

const HISTORY = [
  { id: "bk-1", status: "Checked In", checkInDate: "2026-10-21", checkOutDate: "2026-10-23", nights: 2, roomId: "r-2", totalCost: 3000 },
  { id: "bk-2", status: "Checked Out", checkInDate: "2026-09-10", checkOutDate: "2026-09-12", nights: 2, roomId: "r-1", totalCost: 2000 }];

const ROOMS = [
  { id: "r-1", name: "Deluxe 101", status: "Available", ratePerNight: 1000 },
  { id: "r-2", name: "Suite 201", status: "Occupied", ratePerNight: 1500 }];

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(FoGuestsPage));
  });
}

async function click(text) {
  const buttons = [...container.querySelectorAll("button")];
  const target = buttons.find((b) => b.textContent.includes(text));
  if (!target) throw new Error(`No button "${text}" among: ${buttons.map((b) => b.textContent).join(" | ")}`);
  await act(async () => { target.click(); });
}

async function clickViewProfile(name) {
  const target = [...container.querySelectorAll("button")]
    .find((b) => b.textContent.includes("View profile") &&
      (b.closest("div.rounded-lg")?.textContent || "").includes(name));
  if (!target) throw new Error(`No "View profile" button inside the card for ${name}`);
  await act(async () => { target.click(); });
}

async function rerender() {
  await act(async () => {
    root.render(createElement(FoGuestsPage));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listGuests.mockResolvedValue(GUESTS);
  getUserDoc.mockImplementation(async (uid) =>
    uid === "g-1" ? DOC : { ...GUESTS.find((g) => g.id === uid) });
  listBookingsForUser.mockResolvedValue(HISTORY);
  listRooms.mockResolvedValue(ROOMS);
  listGuestCrmNotes.mockResolvedValue(DOC.crmNotes);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("FoGuestsPage", () => {
  it("lists guests and filters by name or email", async () => {
    await renderPage();

    expect(container.textContent).toContain("Juan Dela Cruz");
    expect(container.textContent).toContain("Maria Santos");

    const input = container.querySelector("input[aria-label='Search guests']");
    setNativeValue(input, "maria");
    await rerender();

    expect(container.textContent).toContain("Maria Santos");
    expect(container.textContent).not.toContain("Juan Dela Cruz");
  });

  it("opens a guest profile with stay history and past notes", async () => {
    await renderPage();
    await clickViewProfile("Juan Dela Cruz");

    expect(listBookingsForUser).toHaveBeenCalledWith("g-1");
    expect(container.textContent).toContain("juan@hotelease.ph");
    expect(container.textContent).toContain("Suite 201"); // room name from history
    expect(container.textContent).toContain("Checked Out");
    expect(container.textContent).toContain("Prefers high floor");
    expect(container.textContent).toContain("Repeat guest — reliable payer");
    expect(container.textContent).toContain("fo-1@hotelease.ph");
  });

  it("blocks a blank note, then appends through the service and shows it", async () => {
    await renderPage();
    await clickViewProfile("Juan Dela Cruz");
    await click("Add note");

    expect(addGuestCrmNote).not.toHaveBeenCalled();

    const textarea = container.querySelector("textarea[aria-label='Add a CRM note']");
    setNativeValue(textarea, "   ");
    await click("Add note");
    expect(addGuestCrmNote).not.toHaveBeenCalled();

    setNativeValue(textarea, "Requested late checkout next stay");
    // The notes list is re-read after the append and returns one more note.
    listGuestCrmNotes.mockResolvedValue([
      ...DOC.crmNotes,
      { note: "Requested late checkout next stay", byEmail: "fo-1@hotelease.ph", at: "2026-10-22T09:00:00.000Z" }]);
    await click("Add note");

    expect(addGuestCrmNote).toHaveBeenCalledWith("g-1", "Requested late checkout next stay");
    expect(container.textContent).toContain("Requested late checkout next stay");
  });

  it("keeps a saved note successful when the refresh fails", async () => {
    await renderPage();
    await clickViewProfile("Juan Dela Cruz");
    const textarea = container.querySelector("textarea[aria-label='Add a CRM note']");
    setNativeValue(textarea, "Saved despite refresh outage");
    // Only the post-save re-list fails; the append itself succeeded.
    listGuestCrmNotes.mockRejectedValueOnce(new Error("list down"));
    await click("Add note");

    expect(addGuestCrmNote).toHaveBeenCalledWith("g-1", "Saved despite refresh outage");
    // The refresh failure surfaces on its own — not as a failed add.
    expect(container.textContent).toContain("Could not load internal notes");
  });
});
