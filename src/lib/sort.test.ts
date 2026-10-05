import { describe, expect, it } from "vitest";
import { hrefWith, parseSort, sortHref, sortRows } from "./sort";

type Row = { name: string; n: number | null; d: Date | null };
const rows: Row[] = [
  { name: "b", n: 2, d: new Date("2026-03-01") },
  { name: "a", n: null, d: null },
  { name: "c", n: 10, d: new Date("2026-01-01") },
  { name: "A2", n: 2, d: new Date("2026-02-01") },
];
const accessors = { name: (r: Row) => r.name, n: (r: Row) => r.n, d: (r: Row) => r.d };

describe("sortRows", () => {
  it("sorts text case-insensitively", () => {
    expect(sortRows(rows, accessors, { key: "name", dir: "asc" }).map((r) => r.name)).toEqual(["a", "A2", "b", "c"]);
  });

  it("sorts numbers numerically, not as text (10 after 2)", () => {
    expect(sortRows(rows, accessors, { key: "n", dir: "asc" }).map((r) => r.n)).toEqual([2, 2, 10, null]);
  });

  it("keeps empty values last in both directions", () => {
    expect(sortRows(rows, accessors, { key: "n", dir: "desc" }).map((r) => r.n)).toEqual([10, 2, 2, null]);
    expect(sortRows(rows, accessors, { key: "d", dir: "desc" }).map((r) => r.name)).toEqual(["b", "A2", "c", "a"]);
  });

  it("is stable for equal values", () => {
    expect(sortRows(rows, accessors, { key: "n", dir: "asc" }).map((r) => r.name).slice(0, 2)).toEqual(["b", "A2"]);
  });

  it("returns the rows unchanged for an unknown column", () => {
    expect(sortRows(rows, accessors, { key: "nope", dir: "asc" })).toEqual(rows);
  });
});

describe("parseSort", () => {
  const fallback = { key: "name", dir: "asc" as const };

  it("accepts known columns and directions", () => {
    expect(parseSort({ sort: "n", dir: "desc" }, ["name", "n"], fallback)).toEqual({ key: "n", dir: "desc" });
  });

  it("falls back for unknown columns", () => {
    expect(parseSort({ sort: "evil", dir: "desc" }, ["name", "n"], fallback)).toEqual(fallback);
  });

  it("defaults a chosen column to ascending when the direction is missing or junk", () => {
    expect(parseSort({ sort: "n", dir: "sideways" }, ["name", "n"], fallback)).toEqual({ key: "n", dir: "asc" });
  });
});

describe("links", () => {
  it("keeps filters when changing the sort", () => {
    expect(sortHref("/projects", { lifecycle: "PRE_NTP" }, "name", { key: "n", dir: "asc" })).toBe(
      "/projects?lifecycle=PRE_NTP&sort=name&dir=asc",
    );
  });

  it("flips the direction when clicking the active column", () => {
    expect(sortHref("/projects", { sort: "name", dir: "asc" }, "name", { key: "name", dir: "asc" })).toBe(
      "/projects?sort=name&dir=desc",
    );
  });

  it("keeps the sort when changing a filter, and drops it when the filter is cleared", () => {
    expect(hrefWith("/projects", { sort: "n", dir: "desc", lifecycle: "ACTIVE" }, { lifecycle: "PRE_NTP" })).toBe(
      "/projects?sort=n&dir=desc&lifecycle=PRE_NTP",
    );
    expect(hrefWith("/projects", { sort: "n", dir: "desc", lifecycle: "ACTIVE" }, { lifecycle: undefined })).toBe(
      "/projects?sort=n&dir=desc",
    );
  });
});
