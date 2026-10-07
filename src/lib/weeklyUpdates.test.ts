import { describe, expect, it } from "vitest";
import { parseRange, presetOf, presetRange, toCsv, weekStart, type ExportRow } from "./weeklyUpdates";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("weeks run Sunday to Saturday", () => {
  it("finds the Sunday a week starts on", () => {
    expect(weekStart(d("2026-10-11")).toISOString().slice(0, 10)).toBe("2026-10-11"); // a Sunday
    expect(weekStart(d("2026-10-07")).toISOString().slice(0, 10)).toBe("2026-10-04"); // a Wednesday
    expect(weekStart(d("2026-10-10")).toISOString().slice(0, 10)).toBe("2026-10-04"); // a Saturday
  });
  it("last week is the Sunday to Saturday before this week", () => {
    expect(presetRange("last-week", d("2026-10-07"))).toEqual({ from: "2026-09-27", to: "2026-10-03" });
    expect(presetRange("last-week", d("2026-10-11"))).toEqual({ from: "2026-10-04", to: "2026-10-10" }); // the meeting Sunday
  });
  it("has this week so far and the last 7 days", () => {
    expect(presetRange("this-week", d("2026-10-07"))).toEqual({ from: "2026-10-04", to: "2026-10-07" });
    expect(presetRange("last-7", d("2026-10-07"))).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });
});

describe("parseRange", () => {
  const today = d("2026-10-07");
  it("uses a valid from/to", () => {
    expect(parseRange({ from: "2026-09-01", to: "2026-09-30" }, today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("falls back to last week for anything invalid", () => {
    const lastWeek = { from: "2026-09-27", to: "2026-10-03" };
    expect(parseRange({}, today)).toEqual(lastWeek);
    expect(parseRange({ from: "2026-09-30", to: "2026-09-01" }, today)).toEqual(lastWeek); // backwards
    expect(parseRange({ from: "2026-02-31", to: "2026-03-05" }, today)).toEqual(lastWeek); // not a date
    expect(parseRange({ from: "2020-01-01", to: "2026-10-01" }, today)).toEqual(lastWeek); // too long
  });
  it("recognises a preset", () => {
    expect(presetOf({ from: "2026-09-27", to: "2026-10-03" }, today)).toBe("last-week");
    expect(presetOf({ from: "2026-09-01", to: "2026-09-30" }, today)).toBeNull();
  });
});

describe("toCsv", () => {
  const row: ExportRow = { project: "257-Barge 2", customer: "Revalue", level: "Item", phase: "01 Design", item: "Layout", status: "In progress", owner: "Dan", update: 'Said "yes",\nwaiting', date: "2026-10-01" };
  it("quotes commas, quotes and line breaks, and starts with a BOM", () => {
    const csv = toCsv([row]);
    expect(csv.startsWith("﻿Project,Customer,Level,Phase,Item,Status,Owner,Update,Update date\r\n")).toBe(true);
    expect(csv).toContain('"Said ""yes"",\nwaiting"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([{ ...row, update: "=HYPERLINK(1)" }])).toContain("'=HYPERLINK(1)");
  });
});
