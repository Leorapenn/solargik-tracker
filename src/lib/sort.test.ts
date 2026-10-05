import { describe, expect, it } from "vitest";
import { hrefWith, nextSort, parseSort, removeSortHref, serializeSort, sortHref, sortRows } from "./sort";

type Row = { name: string; status: string; n: number | null; d: Date | null };
const rows: Row[] = [
  { name: "b", status: "Active", n: 2, d: new Date("2026-03-01") },
  { name: "a", status: "Pre-NTP", n: null, d: null },
  { name: "c", status: "Active", n: 10, d: new Date("2026-01-01") },
  { name: "A2", status: "Active", n: 2, d: new Date("2026-02-01") },
];
const accessors = {
  name: (r: Row) => r.name,
  status: (r: Row) => r.status,
  n: (r: Row) => r.n,
  d: (r: Row) => r.d,
};
const asc = (key: string) => ({ key, dir: "asc" as const });
const desc = (key: string) => ({ key, dir: "desc" as const });

describe("sortRows (single column)", () => {
  it("sorts text case-insensitively", () => {
    expect(sortRows(rows, accessors, [asc("name")]).map((r) => r.name)).toEqual(["a", "A2", "b", "c"]);
  });

  it("sorts numbers numerically, not as text (10 after 2)", () => {
    expect(sortRows(rows, accessors, [asc("n")]).map((r) => r.n)).toEqual([2, 2, 10, null]);
  });

  it("keeps empty values last in both directions", () => {
    expect(sortRows(rows, accessors, [desc("n")]).map((r) => r.n)).toEqual([10, 2, 2, null]);
    expect(sortRows(rows, accessors, [desc("d")]).map((r) => r.name)).toEqual(["b", "A2", "c", "a"]);
  });

  it("is stable for equal values", () => {
    expect(sortRows(rows, accessors, [asc("n")]).map((r) => r.name).slice(0, 2)).toEqual(["b", "A2"]);
  });

  it("returns the rows unchanged for an unknown column", () => {
    expect(sortRows(rows, accessors, [asc("nope")])).toEqual(rows);
  });
});

describe("sortRows (several columns)", () => {
  it("breaks ties in the first column using the second", () => {
    // Active rows first (alphabetical status), and within Active by number descending
    const result = sortRows(rows, accessors, [asc("status"), desc("n")]);
    expect(result.map((r) => r.name)).toEqual(["c", "b", "A2", "a"]);
  });

  it("applies each column's own direction", () => {
    const result = sortRows(rows, accessors, [desc("status"), asc("name")]);
    expect(result.map((r) => r.name)).toEqual(["a", "A2", "b", "c"]);
  });

  it("keeps empty values last within a tie", () => {
    const withTie: Row[] = [
      { name: "x", status: "S", n: null, d: null },
      { name: "y", status: "S", n: 5, d: null },
    ];
    expect(sortRows(withTie, accessors, [asc("status"), desc("n")]).map((r) => r.name)).toEqual(["y", "x"]);
  });

  it("ignores unknown columns in the list", () => {
    expect(sortRows(rows, accessors, [asc("nope"), asc("name")]).map((r) => r.name)).toEqual(["a", "A2", "b", "c"]);
  });
});

describe("parseSort / serializeSort", () => {
  const fallback = { key: "name", dir: "asc" as const };
  const allowed = ["name", "status", "n"];

  it("reads several columns in order", () => {
    expect(parseSort({ sort: "status:asc,n:desc" }, allowed, fallback)).toEqual([asc("status"), desc("n")]);
  });

  it("still understands the older single-column form", () => {
    expect(parseSort({ sort: "n", dir: "desc" }, allowed, fallback)).toEqual([desc("n")]);
  });

  it("drops unknown and repeated columns, falling back when nothing is left", () => {
    expect(parseSort({ sort: "evil:desc,status:asc,status:desc" }, allowed, fallback)).toEqual([asc("status")]);
    expect(parseSort({ sort: "evil:desc" }, allowed, fallback)).toEqual([fallback]);
    expect(parseSort({}, allowed, [fallback])).toEqual([fallback]);
  });

  it("caps the number of columns", () => {
    const many = ["a", "b", "c", "d", "e", "f"];
    expect(parseSort({ sort: many.join(",") }, many, fallback)).toHaveLength(4);
  });

  it("round-trips", () => {
    const state = [asc("status"), desc("n")];
    expect(parseSort({ sort: serializeSort(state) }, allowed, fallback)).toEqual(state);
  });
});

describe("nextSort (header clicks)", () => {
  it("a plain click sorts by only that column, ascending", () => {
    expect(nextSort([asc("name"), desc("n")], "status", "replace")).toEqual([asc("status")]);
  });

  it("a plain click on the same column reverses it", () => {
    expect(nextSort([asc("name")], "name", "replace")).toEqual([desc("name")]);
    expect(nextSort([desc("name")], "name", "replace")).toEqual([asc("name")]);
  });

  it("shift-click adds another column after the existing ones", () => {
    expect(nextSort([asc("status")], "n", "add")).toEqual([asc("status"), asc("n")]);
  });

  it("shift-click on a column already in the list reverses just that column", () => {
    expect(nextSort([asc("status"), asc("n")], "n", "add")).toEqual([asc("status"), desc("n")]);
  });

  it("does not grow past the limit", () => {
    const four = [asc("a"), asc("b"), asc("c"), asc("d")];
    expect(nextSort(four, "e", "add")).toEqual(four);
  });
});

describe("links", () => {
  it("keeps filters when changing the sort, and drops the old dir parameter", () => {
    expect(sortHref("/projects", { lifecycle: "PRE_NTP", dir: "desc" }, "name", [asc("n")])).toBe(
      "/projects?lifecycle=PRE_NTP&sort=name%3Aasc",
    );
  });

  it("builds an 'add a column' link", () => {
    expect(sortHref("/projects", { sort: "status:asc" }, "n", [asc("status")], "add")).toBe("/projects?sort=status%3Aasc%2Cn%3Aasc");
  });

  it("removes one column, and the whole parameter when none are left", () => {
    expect(removeSortHref("/projects", { sort: "status:asc,n:asc" }, "status", [asc("status"), asc("n")])).toBe("/projects?sort=n%3Aasc");
    expect(removeSortHref("/projects", { sort: "n:asc", lifecycle: "ACTIVE" }, "n", [asc("n")])).toBe("/projects?lifecycle=ACTIVE");
  });

  it("keeps the sort when changing a filter", () => {
    expect(hrefWith("/projects", { sort: "n:desc", lifecycle: "ACTIVE" }, { lifecycle: "PRE_NTP" })).toBe(
      "/projects?sort=n%3Adesc&lifecycle=PRE_NTP",
    );
    expect(hrefWith("/projects", { sort: "n:desc", lifecycle: "ACTIVE" }, { lifecycle: undefined })).toBe("/projects?sort=n%3Adesc");
  });
});
