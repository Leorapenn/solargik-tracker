import { describe, expect, it } from "vitest";
import {
  checkNewFlag,
  cleanFlagNote,
  colorOf,
  flagSeverity,
  flagTitle,
  formatNoteDate,
  MAX_FLAGS,
  MAX_FLAG_LENGTH,
  MAX_FLAG_NOTE,
  nextFlagColor,
  nextFlagNote,
  parseFlagColors,
  parseFlagNotes,
  withoutFlag,
} from "./flags";

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

describe("flag notes", () => {
  it("cleans typed notes: trims, normalises line endings, empty means none, limits the length", () => {
    expect(cleanFlagNote("  Held at customs\r\nnobody's fault ")).toEqual({ ok: true, value: "Held at customs\nnobody's fault" });
    expect(cleanFlagNote("   ")).toEqual({ ok: true, value: null });
    expect(cleanFlagNote(null)).toEqual({ ok: true, value: null });
    expect(cleanFlagNote("x".repeat(MAX_FLAG_NOTE)).ok).toBe(true);
    expect(cleanFlagNote("x".repeat(MAX_FLAG_NOTE + 1)).ok).toBe(false);
  });

  it("reads the stored map defensively", () => {
    const notes = parseFlagNotes({ A: { text: "why", at: "2026-10-14" }, B: { text: "  " }, C: "nope", D: { text: "no date" }, E: null });
    expect(notes).toEqual({ A: { text: "why", at: "2026-10-14" }, D: { text: "no date", at: "" } });
    expect(parseFlagNotes(null)).toEqual({});
    expect(parseFlagNotes([1])).toEqual({});
  });

  it("stamps the date only when the text changes; empty text removes the note", () => {
    const old = { text: "Held at customs", at: "2026-10-01" };
    expect(nextFlagNote(undefined, "New", "2026-10-14")).toEqual({ text: "New", at: "2026-10-14" });
    expect(nextFlagNote(old, "Held at customs", "2026-10-14")).toEqual(old);
    expect(nextFlagNote(old, "Released from customs", "2026-10-14")).toEqual({ text: "Released from customs", at: "2026-10-14" });
    expect(nextFlagNote(old, null, "2026-10-14")).toBeNull();
    expect(nextFlagNote(undefined, null, "2026-10-14")).toBeNull();
  });

  it("builds the hover text with the severity, the note and its date", () => {
    expect(flagTitle("Red", undefined)).toBe("Red flag");
    expect(flagTitle(null, undefined)).toBe("Flag");
    expect(flagTitle("Red", { text: "Held at customs", at: "2026-10-14" })).toBe("Red flag: Held at customs (updated 14 Oct 2026)");
    expect(flagTitle("Yellow", { text: "Old note", at: "" })).toBe("Yellow flag: Old note");
    expect(formatNoteDate("2026-01-05")).toBe("05 Jan 2026");
    expect(formatNoteDate("bad")).toBe("");
  });
});

describe("withoutFlag", () => {
  it("removes a flag regardless of case", () => {
    expect(withoutFlag(["A", "Payment risk"], "payment risk")).toEqual(["A"]);
  });
});
