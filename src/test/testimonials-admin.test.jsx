import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  emit: null,
  approve: vi.fn(async () => ({ ok: true })),
  reject: vi.fn(async () => ({ ok: true })),
  remove: vi.fn(async () => ({ ok: true })),
  list: vi.fn(async () => []),
}));

vi.mock("@/services/testimonialsService", () => ({
  subscribeToAllTestimonials: vi.fn((callback) => {
    mocks.emit = callback;
    return () => {};
  }),
  approveTestimonial: mocks.approve,
  rejectTestimonial: mocks.reject,
  deleteTestimonial: mocks.remove,
  listAllTestimonials: mocks.list,
}));

const { default: FoTestimonialsPage } = await import("@/pages/fo/FoTestimonialsPage");

const LONG_MESSAGE =
  "The room was spotless, the staff remembered our anniversary and left a handwritten card, and the breakfast buffet had something for everyone in our family. We would absolutely come back next summer.";

const DATA = [
  {
    id: "t1",
    guestName: "Juan",
    rating: 5,
    message: LONG_MESSAGE,
    status: "Pending",
    createdAt: new Date("2026-10-01T08:00:00Z"),
  },
];

let root = null;
let container = null;

function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(FoTestimonialsPage));
  });
  return container;
}

function clickAction(label) {
  container.querySelector(`button[aria-label="${label}"]`).click();
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  mocks.emit = null;
  mocks.approve.mockClear();
  mocks.reject.mockClear();
  mocks.remove.mockClear();
  mocks.list.mockResolvedValue([]);
});

describe("testimonials moderation actions", () => {
  it("opens the full testimonial in a View dialog", async () => {
    renderPage();
    await act(async () => {
      mocks.emit(DATA);
    });

    expect(container.querySelector('[aria-label="Testimonial actions legend"]')).not.toBeNull();

    await act(async () => {
      clickAction("View testimonial from Juan");
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog).not.toBeNull();
    expect(dialog.className).toContain("max-h-[85vh]");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.textContent).toContain(LONG_MESSAGE);
    expect(dialog.textContent).toContain("Juan");
  });

  it("keeps Approve and Reject working", async () => {
    mocks.list.mockResolvedValue(DATA);
    renderPage();
    await act(async () => {
      mocks.emit(DATA);
    });

    await act(async () => {
      clickAction("Approve testimonial from Juan");
    });
    expect(mocks.approve).toHaveBeenCalledWith("t1");

    await act(async () => {
      clickAction("Reject testimonial from Juan");
    });
    expect(mocks.reject).toHaveBeenCalledWith("t1");
  });

  it("deletes only after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await act(async () => {
      mocks.emit(DATA);
    });

    await act(async () => {
      clickAction("Delete testimonial from Juan");
    });
    expect(mocks.remove).toHaveBeenCalledWith("t1");
    confirmSpy.mockRestore();
  });

  it("does not delete when confirmation is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await act(async () => {
      mocks.emit(DATA);
    });

    await act(async () => {
      clickAction("Delete testimonial from Juan");
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
