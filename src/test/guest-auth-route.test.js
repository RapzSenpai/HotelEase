import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Register now keeps the new session, so this guard is what decides where a
// signed-in, still-unverified guest lands when it fires before the register
// page's own redirect.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ auth: {} }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => state.auth,
}));

const { default: GuestAuthRoute } = await import("@/components/routing/GuestAuthRoute");

let root = null;
let container = null;

async function renderGuard() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/login"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/login",
            element: createElement(GuestAuthRoute, null, createElement("div", null, "login form")),
          }),
          createElement(Route, { path: "/verify-email", element: createElement("div", null, "otp page") }),
          createElement(Route, { path: "/fo", element: createElement("div", null, "fo home") }),
          createElement(Route, { path: "/", element: createElement("div", null, "landing") }),
        ),
      ),
    );
  });
  return container.textContent;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("GuestAuthRoute", () => {
  it("sends a signed-in, unverified guest to the OTP page", async () => {
    state.auth = {
      user: { uid: "u1", isAnonymous: false },
      role: "guest",
      loading: false,
      profile: { emailVerified: false },
    };
    expect(await renderGuard()).toBe("otp page");
  });

  it("sends a verified guest to the guest home instead", async () => {
    state.auth = {
      user: { uid: "u1", isAnonymous: false },
      role: "guest",
      loading: false,
      profile: { emailVerified: true },
    };
    expect(await renderGuard()).toBe("landing");
  });

  it("never gates staff on verification", async () => {
    state.auth = {
      user: { uid: "u2", isAnonymous: false },
      role: "fo",
      loading: false,
      profile: { emailVerified: false },
    };
    expect(await renderGuard()).toBe("fo home");
  });

  it("keeps the form mounted while a sign-in is in flight", async () => {
    state.auth = {
      user: { uid: "u1", isAnonymous: false },
      role: "guest",
      loading: true,
      profile: null,
    };
    expect(await renderGuard()).toContain("Loading...");
  });
});
