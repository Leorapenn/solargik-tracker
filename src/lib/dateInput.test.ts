import { describe, expect, it } from "vitest";
import { formatTyped, maskTypedDate, monthGrid, parseTypedDate } from "./dateInput";

// Simulates typing one character at a time, the way the field receives it.
function type(keys: string): string {
  let text = "";
  for (const key of keys) text = maskTypedDate(text + key, text);
  return text;
}

describe("maskTypedDate", () => {
  it("adds the slashes as you type digits, and accepts a full four-digit year", () => {
    expect(type("05102026")).toBe("05/10/2026");
    expect(type("0510")).toBe("05/10/");
    expect(type("05")).toBe("05/");
  });

  it("does not stop after two digits of the year (the original bug)", () => {
    expect(type("051020")).toBe("05/10/20");
    expect(type("0510202")).toBe("05/10/202");
    expect(type("05102026")).toBe("05/10/2026");
  });

  it("lets you type the separators yourself", () => {
    expect(type("5/10/2026")).toBe("5/10/2026");
    expect(type("5.10.2026")).toBe("5/10/2026");
    expect(type("5-10-26")).toBe("5/10/26");
  });

  it("ignores letters and extra digits", () => {
    expect(type("0x5a10")).toBe("05/10/");
    expect(maskTypedDate("051020261234", "")).toBe("05/10/2026");
  });

  it("lets Backspace delete without re-adding the slash", () => {
    expect(maskTypedDate("05/1", "05/10")).toBe("05/1");
    expect(maskTypedDate("05/", "05/1")).toBe("05/");
    expect(maskTypedDate("05", "05/")).toBe("05");
  });
});

describe("parseTypedDate", () => {
  it("reads the common ways of writing a date", () => {
    for (const text of ["05/10/2026", "5/10/2026", "05.10.2026", "5-10-2026", "05102026", "2026-10-05"]) {
      expect(parseTypedDate(text)).toEqual({ ok: true, iso: "2026-10-05" });
    }
  });

  it("treats empty as clearing the date", () => {
    expect(parseTypedDate("")).toEqual({ ok: true, iso: null });
    expect(parseTypedDate("  ")).toEqual({ ok: true, iso: null });
  });

  it("rejects incomplete, impossible and out-of-range dates", () => {
    // "05/10/20" is rejected on purpose: it may be a year that is still being typed
    for (const text of ["05/10/", "05/10/20", "5/10/26", "31/02/2026", "32/01/2026", "00/10/2026", "05/13/2026", "01/01/1999", "abc"]) {
      expect(parseTypedDate(text)).toEqual({ ok: false });
    }
  });

  it("accepts a leap day only in a leap year", () => {
    expect(parseTypedDate("29/02/2028")).toEqual({ ok: true, iso: "2028-02-29" });
    expect(parseTypedDate("29/02/2027")).toEqual({ ok: false });
  });
});

describe("formatTyped", () => {
  it("shows day first", () => {
    expect(formatTyped("2026-10-05")).toBe("05/10/2026");
    expect(formatTyped(null)).toBe("");
  });
});

describe("monthGrid", () => {
  it("starts weeks on Sunday and places October 2026 correctly (1 Oct 2026 is a Thursday)", () => {
    const grid = monthGrid(2026, 9);
    expect(grid[0].map((d) => d.inMonth)).toEqual([false, false, false, false, true, true, true]);
    expect(grid[0][4]).toEqual({ iso: "2026-10-01", day: 1, inMonth: true });
    expect(grid[0][0].iso).toBe("2026-09-27");
  });

  it("has complete weeks and ends with the last day of the month", () => {
    const grid = monthGrid(2026, 9);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    const inMonth = grid.flat().filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth.at(-1)?.iso).toBe("2026-10-31");
  });

  it("handles February in a leap year and a month that starts on Sunday", () => {
    expect(monthGrid(2028, 1).flat().filter((d) => d.inMonth)).toHaveLength(29);
    expect(monthGrid(2026, 1)[0][0].iso).toBe("2026-02-01"); // 1 Feb 2026 is a Sunday
  });
});
