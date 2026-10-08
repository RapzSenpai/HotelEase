import { describe, expect, it } from "vitest";
import {
  OTP_LENGTH,
  applyOtpInput,
  emptyOtpCells,
  otpBackspaceTarget,
  otpFromCells,
} from "@/lib/otp";

describe("otp boxes", () => {
  it("starts empty at the code length", () => {
    expect(OTP_LENGTH).toBe(6);
    expect(emptyOtpCells()).toEqual(["", "", "", "", "", ""]);
  });

  it("puts a typed digit in its own box and moves on", () => {
    const { cells, focus } = applyOtpInput(emptyOtpCells(), 2, "7");
    expect(cells).toEqual(["", "", "7", "", "", ""]);
    expect(focus).toBe(3);
    expect(otpFromCells(["1", "2", "3", "4", "5", "6"])).toBe("123456");
    // A gap means an incomplete code, so the verify button stays disabled.
    expect(otpFromCells(cells)).toBe("7");
  });

  it("does not collapse a missing cell into a six-digit code", () => {
    const code = otpFromCells(["1", "", "3", "4", "5", "6"]);
    expect(code).toBe("13456");
    expect(code).toHaveLength(5);
  });

  it("spreads a pasted full code from the first box", () => {
    const { cells, focus } = applyOtpInput(emptyOtpCells(), 4, "123456");
    expect(cells).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(focus).toBe(5);
    expect(otpFromCells(cells)).toBe("123456");
  });

  it("puts a short paste at the box it was pasted into", () => {
    const { cells } = applyOtpInput(emptyOtpCells(), 3, "45");
    expect(cells).toEqual(["", "", "", "4", "5", ""]);
  });

  it("ignores non-digits and never overflows", () => {
    const { cells } = applyOtpInput(emptyOtpCells(), 0, "1a2b3c4d5e6f7g");
    expect(cells).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(otpFromCells(cells)).toHaveLength(OTP_LENGTH);
  });

  it("clears its own box on backspace, then walks back from an empty one", () => {
    const filled = ["1", "2", "", "", "", ""];
    // Filled box: clear it, stay put.
    expect(otpBackspaceTarget(filled, 1)).toEqual({
      cells: ["1", "", "", "", "", ""],
      focus: 1,
    });
    // Empty box: move back first, then the next press clears that box.
    const walked = otpBackspaceTarget(filled, 3);
    expect(walked).toEqual({ cells: filled, focus: 2 });
    expect(otpBackspaceTarget(walked.cells, walked.focus)).toEqual({
      cells: ["1", "", "", "", "", ""],
      focus: 1,
    });
    // Already at the first box: nothing left to clear there.
    expect(otpBackspaceTarget(emptyOtpCells(), 0)).toEqual({
      cells: ["", "", "", "", "", ""],
      focus: 0,
    });
  });
});
