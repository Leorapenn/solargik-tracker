import { describe, expect, it } from "vitest";
import {
  MAX_DETAILS,
  MAX_TOPIC,
  STALE_DAYS,
  TASK_STATUSES,
  agoText,
  cleanTask,
  cleanTaskUpdate,
  compareTasks,
  daysBetween,
  matchesFilter,
  parseTaskFilter,
  taskAttention,
  type TaskTimes,
} from "./tasks";

const TODAY = "2026-10-19";
const t = (over: Partial<TaskTimes> = {}): TaskTimes => ({ status: "OPEN", nextFollowUp: null, lastContactAt: "2026-10-18", createdOn: "2026-10-10", ...over });

describe("days and 'ago' text", () => {
  it("counts calendar days and says them plainly", () => {
    expect(daysBetween("2026-10-12", TODAY)).toBe(7);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(agoText("2026-10-19", TODAY)).toBe("today");
    expect(agoText("2026-10-18", TODAY)).toBe("yesterday");
    expect(agoText("2026-10-14", TODAY)).toBe("5 days ago");
    expect(agoText("2026-10-20", TODAY)).toBe("tomorrow");
    expect(agoText("2026-10-25", TODAY)).toBe("in 6 days");
  });
});

describe("taskAttention (the reminders)", () => {
  it("is overdue once the follow-up date has passed, due today on the day", () => {
    expect(taskAttention(t({ nextFollowUp: "2026-10-16" }), TODAY)).toEqual({ level: "overdue", days: 3, text: "Follow-up was due 3 days ago" });
    expect(taskAttention(t({ nextFollowUp: "2026-10-18" }), TODAY)).toEqual({ level: "overdue", days: 1, text: "Follow-up was due yesterday" });
    expect(taskAttention(t({ nextFollowUp: TODAY }), TODAY)).toEqual({ level: "today", days: 0, text: "Follow-up due today" });
  });
  it("needs nothing while a follow-up is scheduled for later, however long ago the last contact was", () => {
    expect(taskAttention(t({ nextFollowUp: "2026-10-22", lastContactAt: "2026-09-01" }), TODAY)).toBeNull();
  });
  it("flags a task as quiet after 7 days without contact when no follow-up date is set", () => {
    expect(STALE_DAYS).toBe(7);
    expect(taskAttention(t({ lastContactAt: "2026-10-12" }), TODAY)).toEqual({ level: "quiet", days: 7, text: "No contact for 7 days" });
    expect(taskAttention(t({ lastContactAt: "2026-10-13" }), TODAY)).toBeNull(); // 6 days
    // never contacted: counted from the day it was created
    expect(taskAttention(t({ lastContactAt: null, createdOn: "2026-10-01" }), TODAY)).toMatchObject({ level: "quiet", days: 18 });
    expect(taskAttention(t({ lastContactAt: null, createdOn: "2026-10-18" }), TODAY)).toBeNull();
  });
  it("never flags a resolved task", () => {
    expect(taskAttention(t({ status: "RESOLVED", nextFollowUp: "2026-01-01" }), TODAY)).toBeNull();
  });
});

describe("compareTasks (most urgent first)", () => {
  it("orders overdue, due today, quiet, then the rest, and resolved last", () => {
    const list = [
      { id: "resolved", ...t({ status: "RESOLVED", nextFollowUp: "2026-01-01" }) },
      { id: "calm-later", ...t({ nextFollowUp: "2026-10-30" }) },
      { id: "quiet-10", ...t({ lastContactAt: "2026-10-09" }) },
      { id: "today", ...t({ nextFollowUp: TODAY }) },
      { id: "overdue-1", ...t({ nextFollowUp: "2026-10-18" }) },
      { id: "overdue-5", ...t({ nextFollowUp: "2026-10-14" }) },
      { id: "quiet-8", ...t({ lastContactAt: "2026-10-11" }) },
      { id: "calm-soon", ...t({ nextFollowUp: "2026-10-21" }) },
    ];
    const sorted = [...list].sort((a, b) => compareTasks(a, b, TODAY)).map((x) => x.id);
    expect(sorted).toEqual(["overdue-5", "overdue-1", "today", "quiet-10", "quiet-8", "calm-soon", "calm-later", "resolved"]);
  });
});

describe("filters", () => {
  it("open = not resolved; needs attention = overdue, due today or quiet", () => {
    expect(parseTaskFilter("nope")).toBe("open");
    expect(parseTaskFilter("resolved")).toBe("resolved");
    expect(matchesFilter(t({ status: "RESOLVED" }), "open", TODAY)).toBe(false);
    expect(matchesFilter(t({ status: "RESOLVED" }), "resolved", TODAY)).toBe(true);
    expect(matchesFilter(t(), "open", TODAY)).toBe(true);
    expect(matchesFilter(t(), "attention", TODAY)).toBe(false);
    expect(matchesFilter(t({ nextFollowUp: TODAY }), "attention", TODAY)).toBe(true);
    expect(matchesFilter(t({ status: "RESOLVED" }), "all", TODAY)).toBe(true);
  });
});

describe("cleanTask", () => {
  const base = { customerId: "c1", topic: "  Disputing   the charges ", status: "WAITING_CUSTOMER" };
  it("trims, collapses spaces and keeps what was typed", () => {
    const r = cleanTask({ ...base, projectId: "p1", details: "Line 1\r\nLine 2 ", ownerId: "o1", lastContactAt: "2026-10-12", lastContactNote: " They replied ", nextFollowUp: "2026-10-22" });
    expect(r).toEqual({
      ok: true,
      value: { customerId: "c1", projectId: "p1", topic: "Disputing the charges", details: "Line 1\nLine 2", status: "WAITING_CUSTOMER", ownerId: "o1", lastContactAt: "2026-10-12", lastContactNote: "They replied", nextFollowUp: "2026-10-22" },
    });
  });
  it("treats empty optional fields as none and defaults the status to Open", () => {
    expect(cleanTask({ customerId: "c1", topic: "x", projectId: "", ownerId: "", details: "", lastContactAt: "", nextFollowUp: "" })).toMatchObject({
      ok: true,
      value: { projectId: null, ownerId: null, details: null, lastContactAt: null, nextFollowUp: null, status: "OPEN" },
    });
  });
  it("refuses a missing customer or topic, a bad status, bad dates and over-long text", () => {
    expect(cleanTask({ topic: "x" }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "   " }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x".repeat(MAX_TOPIC + 1) }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", details: "y".repeat(MAX_DETAILS + 1) }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", status: "DONE" }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", nextFollowUp: "2026-02-31" }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", lastContactAt: "yesterday" }).ok).toBe(false);
  });
  it("has the five statuses", () => {
    expect(TASK_STATUSES.map((s) => s.value)).toEqual(["OPEN", "WAITING_CUSTOMER", "WAITING_US", "CALL_SCHEDULED", "RESOLVED"]);
  });
});

describe("cleanTaskUpdate", () => {
  it("needs text and defaults the date to today", () => {
    expect(cleanTaskUpdate({ text: "  Call set for Thursday " }, TODAY)).toEqual({ ok: true, value: { date: TODAY, text: "Call set for Thursday" } });
    expect(cleanTaskUpdate({ text: "x", date: "2026-10-15" }, TODAY)).toEqual({ ok: true, value: { date: "2026-10-15", text: "x" } });
    expect(cleanTaskUpdate({ text: "  " }, TODAY).ok).toBe(false);
    expect(cleanTaskUpdate({ text: "x", date: "15/10/2026" }, TODAY).ok).toBe(false);
    expect(cleanTaskUpdate({ text: "x".repeat(1001) }, TODAY).ok).toBe(false);
  });
});
