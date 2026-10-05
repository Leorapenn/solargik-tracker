import { describe, expect, it } from "vitest";
import { canonicalQuery, checkViewName, hrefForView, parseStore, removeView, scopeFor, upsertView } from "./savedViews";

describe("saved views", () => {
  it("shares one list of views between every customer / project page", () => {
    expect(scopeFor("/customers/abc")).toBe("/customers/[id]");
    expect(scopeFor("/projects/xyz")).toBe("/projects/[id]");
    expect(scopeFor("/projects")).toBe("/projects");
    expect(scopeFor("/phases")).toBe("/phases");
  });

  it("treats different spellings of the same query as equal", () => {
    expect(canonicalQuery("sort=a%3Aasc&dept=FINANCE")).toBe(canonicalQuery({ dept: "FINANCE", sort: "a:asc" }));
    expect(canonicalQuery({})).toBe("");
    expect(canonicalQuery({ dept: undefined, sort: "" })).toBe("");
  });

  it("reads a damaged store as empty instead of failing", () => {
    expect(parseStore(null)).toEqual({});
    expect(parseStore("{not json")).toEqual({});
    expect(parseStore("[1,2]")).toEqual({});
    expect(parseStore(JSON.stringify({ "/phases": [{ name: "Mine", query: "dept=FINANCE" }, { nope: 1 }] }))).toEqual({
      "/phases": [{ name: "Mine", query: "dept=FINANCE" }],
    });
  });

  it("validates names and replaces a view saved under the same name", () => {
    const list = upsertView([], "Finance", "dept=FINANCE");
    expect(checkViewName("   ", list).ok).toBe(false);
    expect(checkViewName("x".repeat(41), list).ok).toBe(false);
    expect(checkViewName("  my   view ", list)).toEqual({ ok: true, name: "my view" });
    expect(upsertView(list, "finance", "dept=DESIGN")).toEqual([{ name: "finance", query: "dept=DESIGN" }]);
  });

  it("removes a view and builds a link", () => {
    const list = upsertView(upsertView([], "B", "x=1"), "A", "y=2");
    expect(list.map((v) => v.name)).toEqual(["A", "B"]);
    expect(removeView(list, "A").map((v) => v.name)).toEqual(["B"]);
    expect(hrefForView("/phases", "dept=FINANCE")).toBe("/phases?dept=FINANCE");
    expect(hrefForView("/phases", "")).toBe("/phases");
  });
});
