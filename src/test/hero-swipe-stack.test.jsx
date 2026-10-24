import { describe, expect, it, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { nextOrder } = await import("@/pages/public/landing/helpers");
const { default: SwipeCardStack } = await import(
  "@/pages/public/landing/SwipeCardStack"
);

const IMAGES = [1, 2, 3, 4, 5].map((n) => ({
  src: `img-${n}`,
  alt: `Photo ${n}`,
}));

let root = null;
let container = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("nextOrder", () => {
  it("moves the top card to the back", () => {
    expect(nextOrder([0, 1, 2, 3, 4])).toEqual([1, 2, 3, 4, 0]);
  });

  it("loops continuously without dropping cards", () => {
    let order = [0, 1, 2, 3, 4];
    for (let i = 0; i < 5; i++) order = nextOrder(order);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("SwipeCardStack", () => {
  it("renders every image in the stack", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(SwipeCardStack, { images: IMAGES }));
    });
    for (const image of IMAGES) {
      expect(
        container.querySelector(`img[alt="${image.alt}"]`),
      ).not.toBeNull();
    }
  });
});
