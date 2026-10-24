import { describe, expect, it, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { nextOrder } = await import("@/components/rooms/roomPhotoHelpers");
const { default: RoomPhotoStack } = await import(
  "@/components/rooms/RoomPhotoStack"
);

let root = null;
let container = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("roomPhotoHelpers.nextOrder", () => {
  it("moves the top photo to the back", () => {
    expect(nextOrder([0, 1, 2])).toEqual([1, 2, 0]);
  });

  it("loops forever without dropping photos", () => {
    let order = [0, 1, 2];
    for (let i = 0; i < 3; i += 1) order = nextOrder(order);
    expect(order).toEqual([0, 1, 2]);
  });
});

describe("RoomPhotoStack", () => {
  function renderStack(props = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const base = {
      photos: ["p1", "p2", "p3"],
      roomName: "Sakura",
      isFavorite: false,
      onToggleFavorite: () => {},
      user: null,
      role: "guest",
      ...props,
    };
    return act(async () => {
      root.render(createElement(RoomPhotoStack, base));
    });
  }

  it("renders the top card and its peeking card", async () => {
    await renderStack();
    // Top card shows the first photo; the peeking card shows the second.
    expect(container.querySelector(`img[alt="Sakura photo 1 of 3"]`)).not.toBeNull();
    expect(container.querySelector(`img[alt="Sakura photo 2 of 3"]`)).not.toBeNull();
    expect(container.textContent).toContain("1 / 3");
  });

  it("shows the favorite control for signed-in guests only", async () => {
    await renderStack({ user: { uid: "g1" }, role: "guest" });
    expect(
      container.querySelector('[aria-label="Add to favorites"]'),
    ).not.toBeNull();

    await act(() => root.unmount());
    container.remove();
    root = null;
    container = null;

    await renderStack({ user: null });
    expect(
      container.querySelector('[aria-label="Add to favorites"]'),
    ).toBeNull();
  });

  it("keeps an empty placeholder when the room has no photos", async () => {
    await renderStack({ photos: [] });
    expect(container.textContent).toContain("No photos available");
  });

  it("advances the deck from a keyboard-operable next control", async () => {
    await renderStack();

    const next = container.querySelector('[aria-label="Next photo"]');
    expect(next).not.toBeNull();

    await act(async () => {
      next.click();
    });

    expect(container.textContent).toContain("2 / 3");
  });
});
