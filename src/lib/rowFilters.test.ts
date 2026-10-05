import { describe, expect, it } from "vitest";
import { activeFilterKeys, describeFilter, matchesFilters, parseRowFilters, type FilterableRow } from "./rowFilters";

const TODAY = "2026-10-05";
const row = (over: Partial<FilterableRow> = {}): FilterableRow => ({
  phaseName: "DESIGN",
  name: "Design Questionnaire",
  department: "DESIGN",
  ownerId: null,
  status: "NOT_STARTED",
  targetDate: null,
  startedAt: null,
  completedAt: null,
  naDates: [],
  ...over,
});
const f = (params: Record<string, string>) => parseRowFilters(params);

describe("parseRowFilters", () => {
  it("keeps only known values and ignores junk", () => {
    const filters = f({ status: "done,nonsense,BLOCKED", dept: "finance", phase: "SUPPLY,X", target: "overdue,bogus", started: "overdue" });
    expect(filters.status).toEqual(["BLOCKED", "DONE"]);
    expect(filters.dept).toEqual(["FINANCE"]);
    expect(filters.phase).toEqual(["SUPPLY"]);
    expect(filters.target).toEqual(["overdue"]);
    expect(filters.started).toEqual([]); // "overdue" only makes sense for the target date
    expect(activeFilterKeys(filters)).toEqual(["phase", "dept", "target", "status"]);
  });
});

describe("matchesFilters", () => {
  it("matches everything when nothing is filtered", () => {
    expect(matchesFilters(row(), f({}), TODAY)).toBe(true);
  });

  it("treats values within a column as alternatives and different columns as all-required", () => {
    expect(matchesFilters(row({ status: "DONE" }), f({ status: "DONE,BLOCKED" }), TODAY)).toBe(true);
    expect(matchesFilters(row({ status: "IN_PROGRESS" }), f({ status: "DONE,BLOCKED" }), TODAY)).toBe(false);
    expect(matchesFilters(row({ status: "DONE", department: "FINANCE" }), f({ status: "DONE", dept: "DESIGN" }), TODAY)).toBe(false);
  });

  it("filters by owner including unassigned, and by sub-stage text", () => {
    expect(matchesFilters(row({ ownerId: null }), f({ owner: "none" }), TODAY)).toBe(true);
    expect(matchesFilters(row({ ownerId: "p1" }), f({ owner: "none,p2" }), TODAY)).toBe(false);
    expect(matchesFilters(row({ ownerId: "p2" }), f({ owner: "none,p2" }), TODAY)).toBe(true);
    expect(matchesFilters(row({ name: "Customer Kickoff" }), f({ q: "kick" }), TODAY)).toBe(true);
    expect(matchesFilters(row({ name: "Customer Kickoff" }), f({ q: "payment" }), TODAY)).toBe(false);
  });

  it("filters dates: set, none, N/A and overdue", () => {
    const withDate = row({ targetDate: "2026-09-01" });
    const naRow = row({ naDates: ["targetDate"] });
    expect(matchesFilters(withDate, f({ target: "set" }), TODAY)).toBe(true);
    expect(matchesFilters(row(), f({ target: "none" }), TODAY)).toBe(true);
    expect(matchesFilters(naRow, f({ target: "none" }), TODAY)).toBe(false); // N/A is not "missing"
    expect(matchesFilters(naRow, f({ target: "na" }), TODAY)).toBe(true);
    expect(matchesFilters(withDate, f({ target: "overdue" }), TODAY)).toBe(true);
    expect(matchesFilters({ ...withDate, status: "DONE" }, f({ target: "overdue" }), TODAY)).toBe(false);
    expect(matchesFilters(row({ targetDate: "2026-12-01" }), f({ target: "overdue" }), TODAY)).toBe(false);
  });
});

describe("describeFilter", () => {
  it("reads naturally", () => {
    const filters = f({ status: "DONE,BLOCKED", owner: "none,p1", target: "overdue" });
    expect(describeFilter(filters, "status", {})).toBe("Status: Blocked, Done");
    expect(describeFilter(filters, "owner", { p1: "Dana" })).toBe("Owner: Unassigned, Dana");
    expect(describeFilter(filters, "target", {})).toBe("Target: Overdue");
  });
});
