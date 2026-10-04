import { describe, expect, it } from "vitest";
import { derivePhaseStatus } from "./phaseStatus";

describe("derivePhaseStatus", () => {
  it("is NOT_STARTED when nothing has started", () => {
    expect(derivePhaseStatus(["NOT_STARTED", "NOT_STARTED"])).toBe("NOT_STARTED");
  });

  it("is IN_PROGRESS once any sub-stage is in progress", () => {
    expect(derivePhaseStatus(["NOT_STARTED", "IN_PROGRESS", "NOT_STARTED"])).toBe("IN_PROGRESS");
  });

  it("is IN_PROGRESS when some are done but others remain", () => {
    expect(derivePhaseStatus(["DONE", "NOT_STARTED", "NOT_STARTED"])).toBe("IN_PROGRESS");
  });

  it("is DONE only when every sub-stage is done", () => {
    expect(derivePhaseStatus(["DONE", "DONE", "DONE"])).toBe("DONE");
    expect(derivePhaseStatus(["DONE", "DONE", "IN_PROGRESS"])).toBe("IN_PROGRESS");
  });

  it("is BLOCKED if any sub-stage is blocked, even when others are done or in progress", () => {
    expect(derivePhaseStatus(["DONE", "BLOCKED", "DONE"])).toBe("BLOCKED");
    expect(derivePhaseStatus(["IN_PROGRESS", "BLOCKED", "NOT_STARTED"])).toBe("BLOCKED");
  });

  it("returns null for a phase with no sub-stages so its stored status is kept", () => {
    expect(derivePhaseStatus([])).toBeNull();
  });
});
