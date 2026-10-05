import { describe, expect, it } from "vitest";
import { checkNewFlag, MAX_FLAGS, MAX_FLAG_LENGTH, withoutFlag } from "./flags";

describe("checkNewFlag", () => {
  it("trims and collapses spaces", () => {
    expect(checkNewFlag("  Payment   risk ", [])).toEqual({ ok: true, label: "Payment risk" });
  });

  it("rejects empty, over-long and duplicate flags (ignoring case)", () => {
    expect(checkNewFlag("   ", []).ok).toBe(false);
    expect(checkNewFlag("x".repeat(MAX_FLAG_LENGTH + 1), []).ok).toBe(false);
    expect(checkNewFlag("payment RISK", ["Payment risk"]).ok).toBe(false);
  });

  it("limits how many flags there can be", () => {
    const full = Array.from({ length: MAX_FLAGS }, (_, i) => `Flag ${i}`);
    expect(checkNewFlag("One more", full).ok).toBe(false);
  });
});

describe("withoutFlag", () => {
  it("removes a flag regardless of case", () => {
    expect(withoutFlag(["A", "Payment risk"], "payment risk")).toEqual(["A"]);
  });
});
