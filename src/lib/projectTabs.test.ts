import { describe, expect, it } from "vitest";
import { PROJECT_TABS, isProjectTab } from "./projectTabs";

describe("project page tabs", () => {
  it("opens on the profile, the first tab", () => {
    expect(PROJECT_TABS[0].key).toBe("profile");
  });
  it("accepts only the known tabs", () => {
    for (const t of PROJECT_TABS) expect(isProjectTab(t.key)).toBe(true);
    for (const bad of ["", "Profile", "admin", undefined, null, 3, ["phases"]]) expect(isProjectTab(bad)).toBe(false);
  });
});
