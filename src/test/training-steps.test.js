import { describe, it, expect } from "vitest";
import { isTrainingStepDone } from "@/lib/trainingSteps";

describe("isTrainingStepDone", () => {
  it("step 1 follows training mode", () => {
    expect(isTrainingStepDone(1, { trainingMode: true })).toBe(true);
    expect(isTrainingStepDone(1, { trainingMode: false })).toBe(false);
  });

  it("step 2 needs a session code", () => {
    expect(isTrainingStepDone(2, { sessionCode: "ABC123" })).toBe(true);
    expect(isTrainingStepDone(2, { sessionCode: "" })).toBe(false);
    expect(isTrainingStepDone(2, { sessionCode: null })).toBe(false);
  });

  it("step 3 needs training on AND a verified non-empty sandbox", () => {
    expect(
      isTrainingStepDone(3, { trainingMode: true, sandboxEmpty: false }),
    ).toBe(true);
    expect(
      isTrainingStepDone(3, { trainingMode: true, sandboxEmpty: true }),
    ).toBe(false);
    expect(
      isTrainingStepDone(3, { trainingMode: false, sandboxEmpty: false }),
    ).toBe(false);
  });

  it("step 3 stays off while sandbox state is still unknown", () => {
    expect(
      isTrainingStepDone(3, { trainingMode: true, sandboxEmpty: null }),
    ).toBe(false);
    expect(
      isTrainingStepDone(3, { trainingMode: true, sandboxEmpty: undefined }),
    ).toBe(false);
  });

  it("step 4 lights only when steps 1-3 are all done", () => {
    const ready = {
      trainingMode: true,
      sessionCode: "ABC123",
      sandboxEmpty: false,
    };
    expect(isTrainingStepDone(4, ready)).toBe(true);
    expect(isTrainingStepDone(4, { ...ready, sandboxEmpty: true })).toBe(
      false,
    );
    expect(isTrainingStepDone(4, { ...ready, sessionCode: null })).toBe(
      false,
    );
    expect(isTrainingStepDone(4, { ...ready, trainingMode: false })).toBe(
      false,
    );
  });
});
