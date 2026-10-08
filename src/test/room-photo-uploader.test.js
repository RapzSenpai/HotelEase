import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

// The reported bug: with no photos, picking a file left the big dashed
// dropzone on screen next to the progress row, so the section grew and then
// collapsed. There must be exactly one add tile in every state.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cloud = vi.hoisted(() => ({ pending: [] }));

vi.mock("@/services/cloudinaryService", () => ({
  uploadImageToCloudinary: (file, { onProgress } = {}) =>
    new Promise((resolve, reject) => {
      onProgress?.(0);
      cloud.pending.push({ file, resolve, reject });
    }),
}));

const { default: RoomPhotoUploader } = await import("@/components/rooms/RoomPhotoUploader");

let root = null;
let container = null;

async function render(props) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(RoomPhotoUploader, props));
  });
  return container;
}

function addTile() {
  return container.querySelector('button[aria-label="Add room photos"]');
}

async function pickFile(name = "IMG_2204.jpg") {
  const input = container.querySelector('input[type="file"]');
  const file = new File(["x"], name, { type: "image/jpeg" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  cloud.pending = [];
  vi.clearAllMocks();
});

describe("RoomPhotoUploader", () => {
  it("shows one add tile and no placeholder before anything is picked", async () => {
    await render({ photos: [], onChange: vi.fn() });
    expect(addTile().textContent).toContain("Add Photos");
    expect(container.querySelectorAll("button[aria-label='Add room photos']").length).toBe(1);
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).toContain("Max 5MB");
  });

  it("keeps the single add tile while an upload runs, showing progress in the row", async () => {
    await render({ photos: [], onChange: vi.fn() });
    await pickFile();

    // Still one add control — no second empty block — and the upload is a tile
    // in the same row as that control.
    expect(container.querySelectorAll("button[aria-label='Add room photos']").length).toBe(1);
    expect(addTile().textContent).toContain("Add More");
    expect(addTile().parentElement.textContent).toContain("0%");

    await act(async () => {
      cloud.pending[0].resolve({ url: "https://cdn/room-1.jpg" });
    });
    expect(container.textContent).toContain("100%");
  });

  it("reports the uploaded url and renders it as a photo tile", async () => {
    const onChange = vi.fn();
    await render({ photos: [], onChange });
    await pickFile();
    await act(async () => {
      cloud.pending[0].resolve({ url: "https://cdn/room-1.jpg" });
    });
    expect(onChange).toHaveBeenCalledWith(["https://cdn/room-1.jpg"]);

    await act(async () => {
      root.render(
        createElement(RoomPhotoUploader, {
          photos: ["https://cdn/room-1.jpg"],
          onChange,
        }),
      );
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn/room-1.jpg");
    expect(addTile().textContent).toContain("Add More");
    expect(container.textContent).not.toContain("Max 5MB");
  });

  it("surfaces a failed upload instead of dropping the row silently", async () => {
    const onChange = vi.fn();
    await render({ photos: [], onChange });
    await pickFile("broken.png");
    await act(async () => {
      cloud.pending[0].reject(new Error("Cloudinary down"));
    });
    expect(container.textContent).toContain("Failed");
    expect(onChange).not.toHaveBeenCalled();
  });
});
