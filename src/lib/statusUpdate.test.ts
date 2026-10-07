import { describe, expect, it } from "vitest";
import { cleanStatusText, generateSummary, projectSummary, type PhaseProgress } from "./statusUpdate";

const p = (name: PhaseProgress["name"], status: PhaseProgress["status"], done = 0, total = 5): PhaseProgress => ({ name, status, done, total });

describe("cleanStatusText", () => {
  it("trims, normalises line endings and treats empty as none", () => {
    expect(cleanStatusText("  Waiting on permit\r\nCall Dan  ")).toEqual({ ok: true, value: "Waiting on permit\nCall Dan" });
    expect(cleanStatusText("   ")).toEqual({ ok: true, value: null });
    expect(cleanStatusText(null)).toEqual({ ok: true, value: null });
  });
  it("rejects very long text", () => {
    expect(cleanStatusText("x".repeat(5001)).ok).toBe(false);
    expect(cleanStatusText("x".repeat(5000)).ok).toBe(true);
  });
});

describe("generateSummary", () => {
  it("lists blocked, in progress (with counts), done and not started, in phase order", () => {
    const text = generateSummary([
      p("COMMISSIONING", "NOT_STARTED"),
      p("DESIGN", "DONE", 5),
      p("INITIATION", "DONE", 5),
      p("SUPPLY", "IN_PROGRESS", 3, 9),
      p("CONSTRUCTION", "BLOCKED", 1),
      p("OM", "NOT_STARTED"),
    ]);
    expect(text).toBe(
      "Blocked: Construction. In progress: Supply (3 of 9 items done). Done: Initiation, Design. Not started: Commissioning, O&M.",
    );
  });
  it("has special wording for nothing started and for everything done", () => {
    expect(generateSummary([p("INITIATION", "NOT_STARTED"), p("DESIGN", "NOT_STARTED")])).toBe("Not started yet.");
    expect(generateSummary([p("INITIATION", "DONE", 5), p("DESIGN", "DONE", 5)])).toBe("All phases are complete.");
    expect(generateSummary([])).toBe("No phases yet.");
  });
});

describe("projectSummary", () => {
  const phases = [p("INITIATION", "IN_PROGRESS", 1, 4)];
  it("uses the typed summary when there is one", () => {
    expect(projectSummary("  On hold until permit  ", phases)).toEqual({ text: "On hold until permit", manual: true });
  });
  it("falls back to the generated one", () => {
    expect(projectSummary(null, phases)).toEqual({ text: "In progress: Initiation (1 of 4 items done).", manual: false });
    expect(projectSummary("   ", phases).manual).toBe(false);
  });
});
