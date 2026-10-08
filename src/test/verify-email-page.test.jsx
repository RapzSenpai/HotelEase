import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  sendResults: [],
  sendVerificationCode: vi.fn(async () => auth.sendResults.shift()),
  verifyEmailWithCode: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "guest-1", email: "guest@example.com" },
    profile: { emailVerified: false },
    ...auth,
  }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

const { default: VerifyEmailPage } = await import("@/pages/public/VerifyEmailPage");

let root = null;
let container = null;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(VerifyEmailPage));
  });
}

function otpInputs() {
  return [...container.querySelectorAll('input[aria-label^="Digit "]')];
}

function updateInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  auth.sendResults = [];
  auth.sendVerificationCode.mockClear();
  auth.verifyEmailWithCode.mockClear();
  auth.logout.mockClear();
});

describe("VerifyEmailPage OTP cells", () => {
  it("preserves gaps and fills cells for both send and resend fallbacks", async () => {
    auth.sendResults = [
      { ok: true, fallbackCode: "123456", fallbackReason: "Email unavailable" },
      { ok: true, fallbackCode: "654321", fallbackReason: "Email unavailable" },
    ];
    await render();

    expect(otpInputs().map((input) => input.value)).toEqual(["1", "2", "3", "4", "5", "6"]);

    await act(async () => {
      updateInput(otpInputs()[1], "");
    });
    expect(otpInputs().map((input) => input.value)).toEqual(["1", "", "3", "4", "5", "6"]);
    expect([...container.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Verify Email"),
    ).disabled).toBe(true);

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent.includes("Resend Code"),
      ).click();
    });
    expect(otpInputs().map((input) => input.value)).toEqual(["6", "5", "4", "3", "2", "1"]);
  });
});
