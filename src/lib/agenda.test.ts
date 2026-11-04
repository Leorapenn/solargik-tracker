import { describe, expect, it } from "vitest";
import { NO_STAGE, groupByStage, shapeEmailEntry, sortEmailEntries, stageOf, stageRank } from "./agenda";

describe("stages", () => {
  it("orders the stages for the meeting, unknown ones after, no stage last", () => {
    expect(["Cancelled", NO_STAGE, "Construction", "Weird", "Logistics", "O&M Phase", "Design"].sort((a, b) => stageRank(a) - stageRank(b))).toEqual(["Logistics", "Design", "Construction", "O&M Phase", "Cancelled", "Weird", NO_STAGE]);
    expect(stageOf(null)).toBe(NO_STAGE);
    expect(stageOf("  ")).toBe(NO_STAGE);
    expect(stageOf(" Design ")).toBe("Design");
  });

  it("groups projects by stage in meeting order, each stage by project number", () => {
    const groups = groupByStage([
      { stage: "Design", name: "259-Rignano" },
      { stage: "Logistics", name: "87-Old" },
      { stage: "design", name: "112-Other" },
      { stage: "Logistics", name: "360-Hufingen" },
      { stage: NO_STAGE, name: "5-Zed" },
    ]);
    expect(groups.map((g) => [g.stage, g.projects.map((p) => p.name)])).toEqual([
      ["Logistics", ["87-Old", "360-Hufingen"]],
      ["Design", ["112-Other", "259-Rignano"]],
      [NO_STAGE, ["5-Zed"]],
    ]);
  });
});

describe("shapeEmailEntry", () => {
  const row = (extra: Record<string, unknown> = {}) => ({
    id: "a1",
    kind: "CORRESPONDENCE_NOTE",
    summary: "  356 internal:  mechanical BOM Rev03 approved ",
    sourceSubject: "356 - PRJ -  mechanical BOM Rev03 release",
    sourceLink: "https://outlook.office.com/mail/id/1",
    sourceReceivedAt: new Date("2026-11-03T08:00:00Z"),
    reviewedAt: new Date("2026-11-04T08:00:00Z"),
    createdAt: new Date("2026-11-03T09:00:00Z"),
    ...extra,
  });

  it("keeps only the subject, the link to the email, the one-line headline and the email's day", () => {
    const e = shapeEmailEntry(row())!;
    expect(e).toEqual({ id: "a1", kind: "CORRESPONDENCE_NOTE", label: "Email", summary: "356 internal: mechanical BOM Rev03 approved", subject: "356 - PRJ - mechanical BOM Rev03 release", link: "https://outlook.office.com/mail/id/1", date: "2026-11-03" });
  });
  it("falls back to the day it was approved, and has no subject or link when the email gave none", () => {
    expect(shapeEmailEntry(row({ sourceReceivedAt: null }))).toMatchObject({ date: "2026-11-04" });
    expect(shapeEmailEntry(row({ sourceSubject: "  ", sourceLink: null }))).toMatchObject({ subject: null, link: null });
  });
  it("only ever turns a web address into a link, and skips kinds the meeting does not need", () => {
    expect(shapeEmailEntry(row({ sourceLink: "javascript:alert(1)" }))?.link).toBeNull();
    expect(shapeEmailEntry(row({ kind: "CONTACT" }))).toBeNull();
    expect(shapeEmailEntry(row({ kind: "STATUS_CHANGE" }))).toMatchObject({ label: "Status" });
  });
  it("sorts newest first", () => {
    const a = shapeEmailEntry(row({ id: "a", sourceReceivedAt: new Date("2026-11-01T00:00:00Z") }))!;
    const b = shapeEmailEntry(row({ id: "b", sourceReceivedAt: new Date("2026-11-03T00:00:00Z") }))!;
    expect(sortEmailEntries([a, b]).map((e) => e.id)).toEqual(["b", "a"]);
  });
});
