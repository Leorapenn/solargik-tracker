import { describe, expect, it } from "vitest";
import { checkNewFlag, colorOf, flagSeverity, MAX_FLAGS, MAX_FLAG_LENGTH, nextFlagColor, parseFlagColors, withoutFlag } from "./flags";

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

describe("flag colors", () => {
  it("reads the stored map defensively, defaulting to yellow", () => {
    const colors = parseFlagColors({ A: "RED", B: "PURPLE", C: 5 });
    expect(colors).toEqual({ A: "RED" });
    expect(colorOf(colors, "A")).toBe("RED");
    expect(colorOf(colors, "B")).toBe("YELLOW");
    expect(parseFlagColors(null)).toEqual({});
    expect(parseFlagColors([1])).toEqual({});
  });

  it("cycles green, yellow, red", () => {
    expect(nextFlagColor("GREEN")).toBe("YELLOW");
    expect(nextFlagColor("YELLOW")).toBe("RED");
    expect(nextFlagColor("RED")).toBe("GREEN");
  });

  it("ranks customers with a red flag above yellow above green, then by number of flags", () => {
    expect(flagSeverity([], {})).toBe(0);
    expect(flagSeverity(["a"], { a: "RED" })).toBeGreaterThan(flagSeverity(["a", "b", "c"], { a: "YELLOW", b: "YELLOW", c: "YELLOW" }));
    expect(flagSeverity(["a"], { a: "YELLOW" })).toBeGreaterThan(flagSeverity(["a", "b"], { a: "GREEN", b: "GREEN" }));
    expect(flagSeverity(["a", "b"], { a: "GREEN", b: "GREEN" })).toBeGreaterThan(flagSeverity(["a"], { a: "GREEN" }));
  });
});

describe("withoutFlag", () => {
  it("removes a flag regardless of case", () => {
    expect(withoutFlag(["A", "Payment risk"], "payment risk")).toEqual(["A"]);
  });
});
