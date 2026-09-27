import { describe, it, expect } from "vitest";
import { mapAuthError } from "@/lib/authErrors";

describe("login error messages", () => {
  it("never reveals whether an account exists", () => {
    const generic = "The email or password you entered is incorrect.";
    expect(mapAuthError({ code: "auth/invalid-credential" })).toBe(generic);
    expect(mapAuthError({ code: "auth/user-not-found" })).toBe(generic);
    expect(mapAuthError({ code: "auth/wrong-password" })).toBe(generic);
  });

  it("still maps non-credential errors specifically", () => {
    expect(mapAuthError({ code: "auth/too-many-requests" })).toMatch(/too many/i);
    expect(mapAuthError({ code: "auth/network-request-failed" })).toMatch(/network/i);
  });
});
