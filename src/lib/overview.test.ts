import { describe, expect, it } from "vitest";
import { byOwner, byPhase, countStatuses, daysOverdue, inDepartment, isOverdue, needsAttention, parseDepartment, parseOverviewStatus, summarize, withStatus, type OverviewItem } from "./overview";

const TODAY = "2026-11-08";
let n = 0;
const item = (extra: Partial<OverviewItem> = {}): OverviewItem => ({
  id: `i${++n}`,
  projectId: "p1",
  projectName: "259-Rignano",
  customerName: "Revalue",
  phase: "DESIGN",
  item: `Item ${n}`,
  department: "DESIGN",
  status: "NOT_STARTED",
  ownerName: null,
  targetDate: null,
  ...extra,
});

describe("counts", () => {
  it("counts the four statuses, the percent done and what is blocked or overdue", () => {
    const items = [item({ status: "DONE" }), item({ status: "DONE", targetDate: "2026-10-01" }), item({ status: "IN_PROGRESS", targetDate: "2026-11-01" }), item({ status: "BLOCKED" }), item({ status: "NOT_STARTED", targetDate: "2026-12-01" }), item()];
    expect(countStatuses(items)).toEqual({ DONE: 2, IN_PROGRESS: 1, BLOCKED: 1, NOT_STARTED: 2 });
    expect(summarize(items, TODAY)).toEqual({ total: 6, counts: { DONE: 2, IN_PROGRESS: 1, BLOCKED: 1, NOT_STARTED: 2 }, donePercent: 33, blocked: 1, overdue: 1 }); // a done item past its date is not overdue
    expect(summarize([], TODAY)).toMatchObject({ total: 0, donePercent: 0, overdue: 0 });
  });

  it("overdue = open and past its target date, counted in days", () => {
    expect(isOverdue({ status: "IN_PROGRESS", targetDate: "2026-11-07" }, TODAY)).toBe(true);
    expect(isOverdue({ status: "IN_PROGRESS", targetDate: TODAY }, TODAY)).toBe(false);
    expect(isOverdue({ status: "NOT_STARTED", targetDate: null }, TODAY)).toBe(false);
    expect(isOverdue({ status: "DONE", targetDate: "2026-01-01" }, TODAY)).toBe(false);
    expect(daysOverdue({ targetDate: "2026-11-01" }, TODAY)).toBe(7);
    expect(daysOverdue({ targetDate: "2026-12-01" }, TODAY)).toBe(0);
    expect(daysOverdue({ targetDate: null }, TODAY)).toBe(0);
  });
});

describe("grouping", () => {
  it("narrows to one department", () => {
    const items = [item({ department: "SUPPLY" }), item({ department: "DESIGN" }), item({ department: "SUPPLY" })];
    expect(inDepartment(items, "SUPPLY")).toHaveLength(2);
    expect(inDepartment(items, null)).toHaveLength(3);
  });

  it("per phase in project order, only phases that have items", () => {
    const rows = byPhase([item({ phase: "SUPPLY", status: "DONE" }), item({ phase: "INITIATION" }), item({ phase: "SUPPLY", status: "BLOCKED" })]);
    expect(rows.map((r) => [r.phase, r.total, r.counts.DONE, r.counts.BLOCKED])).toEqual([["INITIATION", 1, 0, 0], ["SUPPLY", 2, 1, 1]]);
  });

  it("open work per person, most first, done items left out, nobody's items last", () => {
    const rows = byOwner(
      [
        item({ ownerName: "Amit", status: "IN_PROGRESS" }),
        item({ ownerName: "Yoni", status: "BLOCKED", targetDate: "2026-10-01" }),
        item({ ownerName: "Yoni", status: "NOT_STARTED" }),
        item({ ownerName: "Yoni", status: "DONE" }),
        item({ ownerName: null, status: "NOT_STARTED" }),
        item({ ownerName: null, status: "NOT_STARTED" }),
        item({ ownerName: null, status: "NOT_STARTED" }),
      ],
      TODAY,
    );
    expect(rows).toEqual([
      { name: "Yoni", open: 2, blocked: 1, overdue: 1 },
      { name: "Amit", open: 1, blocked: 0, overdue: 0 },
      { name: null, open: 3, blocked: 0, overdue: 0 },
    ]);
  });
});

describe("what needs a look", () => {
  it("blocked first, then overdue with the longest overdue first; neither done nor on time ones appear", () => {
    const a = item({ item: "A", status: "IN_PROGRESS", targetDate: "2026-11-05" });
    const b = item({ item: "B", status: "BLOCKED", targetDate: "2026-10-20" });
    const c = item({ item: "C", status: "NOT_STARTED", targetDate: "2026-10-01" });
    const d = item({ item: "D", status: "BLOCKED" });
    const e = item({ item: "E", status: "DONE", targetDate: "2026-01-01" });
    const f = item({ item: "F", status: "IN_PROGRESS", targetDate: "2026-12-01" });
    expect(needsAttention([a, b, c, d, e, f], TODAY).map((i) => i.item)).toEqual(["B", "D", "C", "A"]);
  });

  it("lists the items of one status by project number", () => {
    const rows = withStatus([item({ projectName: "259-X", status: "BLOCKED" }), item({ projectName: "87-Y", status: "BLOCKED" }), item({ status: "DONE" })], "BLOCKED");
    expect(rows.map((r) => r.projectName)).toEqual(["87-Y", "259-X"]);
  });
});

describe("the address", () => {
  it("accepts only real departments and statuses", () => {
    expect(parseDepartment("SUPPLY")).toBe("SUPPLY");
    expect(parseDepartment(["DESIGN", "X"])).toBe("DESIGN");
    expect(parseDepartment("supply")).toBeNull();
    expect(parseDepartment("<script>")).toBeNull();
    expect(parseDepartment(undefined)).toBeNull();
    expect(parseOverviewStatus("BLOCKED")).toBe("BLOCKED");
    expect(parseOverviewStatus("NOT_APPLICABLE")).toBeNull();
    expect(parseOverviewStatus("x")).toBeNull();
  });
});
