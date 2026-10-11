import { describe, expect, it } from "vitest";
import { applyFilters, countByStatus, groupActions, parseScope, parseStatusFilter, type ActionRow } from "./actionItems";

const row = (over: Partial<ActionRow> = {}): ActionRow => ({
  id: "a",
  kind: "ACTION_ITEM",
  kindLabel: "Action",
  summary: "Send the layout",
  text: null,
  who: "Dan",
  by: "Friday",
  from: "dan@revalue-energies.com",
  subject: "Layout",
  link: null,
  date: "2026-10-08",
  done: false,
  doneOn: null,
  projectId: "p259",
  projectName: "259-Rignano Flaminio 1",
  customerId: "c1",
  customerName: "Revalue",
  ...over,
});

describe("parseStatusFilter / parseScope", () => {
  it("defaults to open and accepts done and all", () => {
    expect(parseStatusFilter(undefined)).toBe("open");
    expect(parseStatusFilter("done")).toBe("done");
    expect(parseStatusFilter(["ALL"])).toBe("all");
    expect(parseStatusFilter("whatever")).toBe("open");
  });
  it("reads a project or a customer, and nothing else", () => {
    expect(parseScope("p:cmu123")).toEqual({ kind: "project", id: "cmu123" });
    expect(parseScope("c:cmu456")).toEqual({ kind: "customer", id: "cmu456" });
    for (const bad of [undefined, "", "x:1", "p:", "p:has space", "p:" + "a".repeat(80), "'; drop table"]) expect(parseScope(bad)).toBeNull();
  });
});

describe("applyFilters / countByStatus", () => {
  const rows = [
    row({ id: "1" }),
    row({ id: "2", done: true, doneOn: "2026-10-10" }),
    row({ id: "3", projectId: "p260", projectName: "260-Other" }),
    row({ id: "4", projectId: null, projectName: null }), // a general item for Revalue
    row({ id: "5", projectId: null, projectName: null, customerId: "c2", customerName: "Other Co" }),
  ];
  it("filters by status", () => {
    expect(applyFilters(rows, "open", null).map((r) => r.id)).toEqual(["1", "3", "4", "5"]);
    expect(applyFilters(rows, "done", null).map((r) => r.id)).toEqual(["2"]);
    expect(applyFilters(rows, "all", null)).toHaveLength(5);
  });
  it("filters by project, or by a customer's general items only", () => {
    expect(applyFilters(rows, "all", { kind: "project", id: "p259" }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(applyFilters(rows, "all", { kind: "customer", id: "c1" }).map((r) => r.id)).toEqual(["4"]); // not the project items of c1
  });
  it("counts open, done and all", () => {
    expect(countByStatus(rows)).toEqual({ open: 4, done: 1, all: 5 });
    expect(countByStatus([])).toEqual({ open: 0, done: 0, all: 0 });
  });
});

describe("groupActions", () => {
  it("groups by project (numeric order), then customers' general items, then the rest; newest first inside", () => {
    const rows = [
      row({ id: "n", projectId: null, projectName: null, customerId: null, customerName: null }),
      row({ id: "g", projectId: null, projectName: null }),
      row({ id: "b-old", projectId: "p1000", projectName: "1000-Big", date: "2026-10-01" }),
      row({ id: "a-old", date: "2026-10-01" }),
      row({ id: "a-new", date: "2026-10-09" }),
      row({ id: "c", projectId: "p318", projectName: "318-San Miniato", date: "2026-10-05" }),
    ];
    const groups = groupActions(rows);
    expect(groups.map((g) => g.title)).toEqual(["259-Rignano Flaminio 1", "318-San Miniato", "1000-Big", "Revalue (general)", "No project or customer"]);
    expect(groups[0].items.map((r) => r.id)).toEqual(["a-new", "a-old"]);
    expect(groups.map((g) => g.href)).toEqual(["/projects/p259", "/projects/p318", "/projects/p1000", "/customers/c1", null]);
  });
  it("is empty for no rows", () => {
    expect(groupActions([])).toEqual([]);
  });
});
