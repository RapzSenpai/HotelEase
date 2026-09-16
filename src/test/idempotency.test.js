import { describe, expect, it } from "vitest";
import { sanitizeIdempotencyKey } from "@/services/paymentsService";

describe("sanitizeIdempotencyKey", () => {
  it("accepts keys, blanks to null, rejects path injection", () => {
    expect(sanitizeIdempotencyKey(null)).toBe(null);
    expect(sanitizeIdempotencyKey("abc12345-_")).toBe("abc12345-_");
    expect(() => sanitizeIdempotencyKey("../evil")).toThrow("Invalid idempotency key.");
    expect(() => sanitizeIdempotencyKey("a".repeat(65))).toThrow("Invalid idempotency key.");
  });
});
