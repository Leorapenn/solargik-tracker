import { describe, expect, it } from "vitest";
import { parseFolded, withFolded } from "./foldState";

describe("fold state (remembered per browser)", () => {
  it("reads the stored list, and treats nothing or a damaged value as everything open", () => {
    expect(parseFolded('["group:c1","task:t1"]')).toEqual(["group:c1", "task:t1"]);
    expect(parseFolded(null)).toEqual([]);
    expect(parseFolded(undefined)).toEqual([]);
    expect(parseFolded("not json")).toEqual([]);
    expect(parseFolded('{"a":1}')).toEqual([]);
    expect(parseFolded('["group:c1", 5, null, "task:t1"]')).toEqual(["group:c1", "task:t1"]);
  });
  it("folds and opens one id without touching the others", () => {
    const one = withFolded(null, "group:c1", true);
    const two = withFolded(one, "task:t1", true);
    expect(parseFolded(two)).toEqual(["group:c1", "task:t1"]);
    expect(parseFolded(withFolded(two, "group:c1", false))).toEqual(["task:t1"]);
    expect(parseFolded(withFolded(two, "task:t1", true)).filter((x) => x === "task:t1")).toHaveLength(1);
  });
  it("keeps at most 500 ids, dropping the oldest", () => {
    let raw: string | null = null;
    for (let i = 0; i < 520; i++) raw = withFolded(raw, `task:${i}`, true);
    const ids = parseFolded(raw);
    expect(ids).toHaveLength(500);
    expect(ids[0]).toBe("task:20");
    expect(ids[499]).toBe("task:519");
  });
});