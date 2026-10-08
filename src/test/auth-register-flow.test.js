import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

// Register now keeps the session Firebase already created, and the profile doc
// can land after the auth callback raced ahead. Both are silent failures if
// they break — the guest just ends up stuck unverified — so they get a check.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  authStateCb: null,
  signOut: vi.fn(async () => {}),
  snapshotCb: null,
  subscribeCalls: 0,
  createUserProfile: vi.fn(async () => {}),
  getUserDoc: vi.fn(async () => null),
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(async () => ({
    user: { uid: "u1", email: "new@example.com" },
  })),
  signInAnonymously: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: h.signOut,
  sendPasswordResetEmail: vi.fn(),
  onAuthStateChanged: (_auth, cb) => {
    h.authStateCb = cb;
    return () => {};
  },
  setPersistence: vi.fn(async () => {}),
  browserLocalPersistence: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  getDocs: async () => ({ docs: [] }),
  onSnapshot: (_ref, cb) => {
    h.subscribeCalls += 1;
    h.snapshotCb = cb;
    return () => {};
  },
  query: () => ({}),
  serverTimestamp: () => ({}),
  updateDoc: async () => {},
  where: () => ({}),
}));

vi.mock("@/services/userService", () => ({
  createUserProfile: h.createUserProfile,
  getUserDoc: h.getUserDoc,
  setOnlineStatus: async () => {},
  updateLastLogin: async () => {},
}));
vi.mock("@/services/presenceService", () => ({
  startPresence: () => {},
  stopPresence: () => {},
}));
vi.mock("@/services/sessionService", () => ({
  createSession: async () => ({ id: "session-1" }),
}));
vi.mock("@/services/trainingService", () => ({
  getTrainingSystemState: async () => ({ enabled: false }),
  validateTrainingSessionCode: async () => ({ ok: true }),
  deleteOwnTrainingProfile: async () => {},
}));

const firebaseConfig = await import("@/firebase/firebase.config");
const { AuthProvider, useAuth } = await import("@/contexts/AuthContext");

let ctx = null;
function Probe() {
  ctx = useAuth();
  return null;
}

let root = null;
let container = null;

async function mountProvider() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AuthProvider, null, createElement(Probe, null)));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  ctx = null;
  h.subscribeCalls = 0;
  vi.clearAllMocks();
});

describe("register flow", () => {
  it("keeps the session instead of signing the new account back out", async () => {
    await mountProvider();
    await act(async () => {
      await ctx.register({
        email: "new@example.com",
        password: "Password1!",
        fullName: "New Guest",
        phone: "09171234567",
      });
    });

    expect(h.createUserProfile).toHaveBeenCalledTimes(1);
    expect(h.createUserProfile.mock.calls[0][0]).toMatchObject({
      uid: "u1",
      role: "guest",
    });
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("adopts the profile when it lands after the auth callback raced ahead", async () => {
    await mountProvider();
    // The callback only proceeds for the live session user.
    firebaseConfig.auth.currentUser = { uid: "u2" };
    h.getUserDoc.mockResolvedValueOnce(null);

    await act(async () => {
      await h.authStateCb({
        uid: "u2",
        email: "late@example.com",
        isAnonymous: false,
        metadata: { lastSignInTime: new Date().toISOString() },
      });
    });

    // No doc yet, but the subscription must be live so the arriving doc counts.
    expect(h.subscribeCalls).toBe(1);
    expect(ctx.profile).toBeNull();

    await act(async () => {
      h.snapshotCb({
        exists: () => true,
        data: () => ({ role: "guest", emailVerified: false }),
      });
    });

    expect(ctx.profile?.emailVerified).toBe(false);
    expect(ctx.role).toBe("guest");
  });
});
