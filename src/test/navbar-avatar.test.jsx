import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  auth: {
    user: { uid: "u1", displayName: null, email: "juan@example.com" },
    role: "guest",
    profile: { fullName: "Juan Dela Cruz", photoUrl: "" },
    loading: false,
    logout: async () => {},
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.auth}));

vi.mock("@/components/notifications/NotificationBell", () => ({
  default: () => null}));

const { default: Navbar } = await import("@/components/layout/Navbar");

let root = null;
let container = null;

function renderNavbar() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(MemoryRouter, null, createElement(Navbar)));
  });
  return container;
}

function avatarOf(element) {
  return element.querySelector('[data-slot="user-avatar"]');
}

beforeEach(() => {
  mocks.auth.profile = { fullName: "Juan Dela Cruz", photoUrl: "" };
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Navbar profile avatar", () => {
  it("shows the profile photo when one exists", () => {
    mocks.auth.profile = {
      fullName: "Juan Dela Cruz",
      photoUrl: "https://res.cloudinary.com/demo/image/upload/avatar.jpg",
    };
    const element = renderNavbar();

    const img = avatarOf(element).querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toContain("w_96");
    expect(avatarOf(element).textContent).not.toContain("JC");
  });

  it("falls back to the initials of the first and last name", () => {
    const element = renderNavbar();

    expect(avatarOf(element).querySelector("img")).toBeNull();
    expect(avatarOf(element).textContent).toBe("JC");
  });

  it("falls back to initials when the photo URL fails to load", () => {
    mocks.auth.profile = {
      fullName: "Juan Dela Cruz",
      photoUrl: "https://res.cloudinary.com/demo/image/upload/broken.jpg",
    };
    const element = renderNavbar();

    act(() => {
      avatarOf(element).querySelector("img").dispatchEvent(new Event("error"));
    });

    expect(avatarOf(element).querySelector("img")).toBeNull();
    expect(avatarOf(element).textContent).toBe("JC");
  });

  it("uses a single letter when there is no last name", () => {
    mocks.auth.profile = { fullName: "Juan", photoUrl: "" };
    const element = renderNavbar();

    expect(avatarOf(element).textContent).toBe("J");
  });

  it("keeps the Profile link to the profile page", () => {
    const element = renderNavbar();

    const link = element.querySelector('a[href="/profile"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain("Profile");
  });
});
