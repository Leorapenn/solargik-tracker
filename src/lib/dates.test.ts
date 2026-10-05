import { describe, expect, it } from "vitest";
import { formatDate, parseDateInput, toDateInputValue, todayInAppTz } from "./dates";
import { applyStatusToDates } from "./subStageDates";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("todayInAppTz", () => {
  it("uses the Israel calendar date, not UTC", () => {
    // 23:30 UTC on 4 Oct is already 5 Oct in Israel (UTC+3 in October).
    expect(todayInAppTz(new Date("2026-10-04T23:30:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    // 00:30 UTC on 5 Oct is the same Israeli day.
    expect(todayInAppTz(new Date("2026-10-05T00:30:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});

describe("parseDateInput / toDateInputValue / formatDate", () => {
  it("round-trips a date", () => {
    expect(toDateInputValue(parseDateInput("2026-10-05"))).toBe("2026-10-05");
  });

  it("treats empty as no date", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput(null)).toBeNull();
    expect(toDateInputValue(null)).toBe("");
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => parseDateInput("05/10/2026")).toThrow();
    expect(() => parseDateInput("2026-02-31")).toThrow();
    expect(() => parseDateInput("1999-01-01")).toThrow();
  });

  it("formats for display", () => {
    expect(formatDate(d("2026-09-02"))).toBe("02 Sep 2026");
    expect(formatDate(null)).toBe("—");
  });
});

describe("applyStatusToDates", () => {
  const today = d("2026-10-05");
  const none = { startedAt: null, completedAt: null };

  it("starting work records the start date once", () => {
    expect(applyStatusToDates(none, "IN_PROGRESS", today)).toEqual({ startedAt: today, completedAt: null });
    const already = { startedAt: d("2026-09-01"), completedAt: null };
    expect(applyStatusToDates(already, "IN_PROGRESS", today).startedAt).toEqual(d("2026-09-01"));
  });

  it("finishing records completion today, and a start date if there was none", () => {
    expect(applyStatusToDates(none, "DONE", today)).toEqual({ startedAt: today, completedAt: today });
    const started = { startedAt: d("2026-09-01"), completedAt: null };
    expect(applyStatusToDates(started, "DONE", today)).toEqual({ startedAt: d("2026-09-01"), completedAt: today });
  });

  it("reopening a finished item clears the completion date but keeps the start", () => {
    const done = { startedAt: d("2026-09-01"), completedAt: d("2026-09-20") };
    expect(applyStatusToDates(done, "IN_PROGRESS", today)).toEqual({ startedAt: d("2026-09-01"), completedAt: null });
    expect(applyStatusToDates(done, "BLOCKED", today)).toEqual({ startedAt: d("2026-09-01"), completedAt: null });
  });

  it("blocking an item that never started does not invent a start date", () => {
    expect(applyStatusToDates(none, "BLOCKED", today)).toEqual(none);
  });

  it("resetting to not started clears both", () => {
    const done = { startedAt: d("2026-09-01"), completedAt: d("2026-09-20") };
    expect(applyStatusToDates(done, "NOT_STARTED", today)).toEqual(none);
  });
});
