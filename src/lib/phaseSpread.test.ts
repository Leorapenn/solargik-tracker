import { describe, expect, it } from "vitest";
import { phaseBreakdown, phaseSpread, progressScore } from "./phaseSpread";
import { NAVY } from "./theme";

describe("phaseBreakdown", () => {
  const projects = [
    { id: "b", name: "Beta", phases: [{ name: "DESIGN" as const, status: "IN_PROGRESS" as const }] },
    { id: "a", name: "Alpha", phases: [{ name: "DESIGN" as const, status: "DONE" as const }, { name: "SUPPLY" as const, status: "BLOCKED" as const }] },
  ];

  it("lists every project per phase with its status, sorted by name", () => {
    const b = phaseBreakdown(projects);
    expect(b.DESIGN).toEqual([
      { id: "a", name: "Alpha", status: "DONE" },
      { id: "b", name: "Beta", status: "IN_PROGRESS" },
    ]);
    expect(b.SUPPLY.map((p) => [p.name, p.status])).toEqual([["Alpha", "BLOCKED"], ["Beta", "NOT_STARTED"]]); // a missing phase counts as not started
  });
  it("leaves projects where a phase is N/A out of 'all done' and the score, and says how many", () => {
    const mixed = [
      { id: "a", name: "A", phases: [{ name: "DESIGN" as const, status: "DONE" as const }] },
      { id: "b", name: "B", phases: [{ name: "DESIGN" as const, status: "NOT_APPLICABLE" as const }] },
    ];
    const design = phaseSpread(mixed).find((s) => s.phase === "DESIGN")!;
    expect(design.color).toBe(NAVY); // every project it applies to has finished it
    expect(design.title).toContain("1 N/A");
    expect(progressScore(mixed)).toBeGreaterThanOrEqual(2);
    expect(phaseBreakdown(mixed).DESIGN.map((p) => p.status)).toEqual(["DONE", "NOT_APPLICABLE"]);
  });
  it("covers all six phases, also with no projects", () => {
    expect(Object.keys(phaseBreakdown([]))).toEqual(["INITIATION", "DESIGN", "SUPPLY", "CONSTRUCTION", "COMMISSIONING", "OM"]);
  });
});
