import { describe, expect, it } from "vitest";
import { phaseBreakdown } from "./phaseSpread";

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
  it("covers all six phases, also with no projects", () => {
    expect(Object.keys(phaseBreakdown([]))).toEqual(["INITIATION", "DESIGN", "SUPPLY", "CONSTRUCTION", "COMMISSIONING", "OM"]);
  });
});
