import { describe, expect, it } from "vitest";
import { cleanDeadline, deadlineLocal, deadlineParts, deadlineStatus, formatDeadline, parseDeadlineLocal } from "./deadline";

describe("Israel wall time <-> instant", () => {
  it("reads a local time with the right offset in winter (UTC+2) and summer (UTC+3)", () => {
    expect(parseDeadlineLocal("2026-01-15T17:00")!.toISOString()).toBe("2026-01-15T15:00:00.000Z");
    expect(parseDeadlineLocal("2026-07-15T17:00")!.toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });
  it("round-trips, also around the clock changes", () => {
    for (const local of ["2026-01-15T17:00", "2026-07-15T08:30", "2026-10-25T00:30", "2026-10-25T23:59", "2026-03-27T12:00", "2026-03-28T01:00"]) {
      expect(deadlineLocal(parseDeadlineLocal(local))).toBe(local);
    }
    expect(deadlineParts(new Date("2026-10-29T14:00:00Z"))).toEqual({ date: "2026-10-29", time: "16:00" }); // Israel is on winter time from 25 Oct 2026
  });
  it("refuses anything that is not a real day and time", () => {
    for (const bad of ["", "2026-13-01T10:00", "2026-02-30T10:00", "2026-10-29T24:00", "2026-10-29T10:60", "2026-10-29", "tomorrow 5pm", "2026-10-29 10:00"]) {
      expect(parseDeadlineLocal(bad)).toBeNull();
    }
  });
  it("cleans the form value: empty = none, a valid one is kept as typed, anything else is an error", () => {
    expect(cleanDeadline("")).toEqual({ ok: true, value: null });
    expect(cleanDeadline(undefined)).toEqual({ ok: true, value: null });
    expect(cleanDeadline("2026-10-30T17:00")).toEqual({ ok: true, value: "2026-10-30T17:00" });
    expect(cleanDeadline("2026-10-30").ok).toBe(false);
  });
  it("shows the deadline as weekday, day, month, year and time", () => {
    expect(formatDeadline(parseDeadlineLocal("2026-10-30T17:00")!)).toBe("Fri 30 Oct 2026, 17:00");
  });
});

describe("deadlineStatus (days and hours)", () => {
  const now = new Date("2026-10-29T10:00:00Z"); // 12:00 in Israel
  const at = (local: string) => parseDeadlineLocal(local)!;
  it("counts the days and hours left", () => {
    expect(deadlineStatus(at("2026-10-31T17:00"), now)).toMatchObject({ overdue: false, days: 2, hours: 5, text: "2 days 5 hours left", level: "soon" });
    expect(deadlineStatus(at("2026-11-03T17:00"), now)).toMatchObject({ days: 5, hours: 5, text: "5 days 5 hours left", level: "later" });
    expect(deadlineStatus(at("2026-10-30T12:00"), now)).toMatchObject({ days: 1, hours: 0, text: "1 day left", level: "soon" });
    expect(deadlineStatus(at("2026-10-29T17:00"), now)).toMatchObject({ days: 0, hours: 5, text: "5 hours left", level: "today" });
    expect(deadlineStatus(at("2026-10-29T12:30"), now)).toMatchObject({ text: "less than 1 hour left", level: "today" });
  });
  it("counts how late it is once it has passed", () => {
    expect(deadlineStatus(at("2026-10-29T09:00"), now)).toMatchObject({ overdue: true, level: "overdue", text: "Overdue by 3 hours" });
    expect(deadlineStatus(at("2026-10-27T10:00"), now)).toMatchObject({ overdue: true, days: 2, hours: 2, text: "Overdue by 2 days 2 hours" });
    expect(deadlineStatus(at("2026-10-29T11:45"), now)).toMatchObject({ overdue: true, text: "Overdue by less than 1 hour" });
  });
  it("calls a deadline later today 'today' even a few hours away, and the far ones 'later'", () => {
    expect(deadlineStatus(at("2026-10-29T23:59"), now).level).toBe("today");
    expect(deadlineStatus(at("2026-11-12T09:00"), now).level).toBe("later");
  });
});
