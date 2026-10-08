import { describe, expect, it } from "vitest";
import { agentInstructions } from "./suggestions";
import { cleanImportRun, formatRunTime } from "./importRun";

const NOW = new Date("2026-10-08T10:00:00Z");

describe("cleanImportRun", () => {
  it("accepts the email count and defaults the time to now", () => {
    expect(cleanImportRun({ emailsChecked: 42 }, NOW)).toEqual({ ok: true, value: { ranAt: NOW, emailsChecked: 42 } });
  });

  it("does not take proposal or unmatched counts from the agent", () => {
    const r = cleanImportRun({ emailsChecked: 42, proposalsCreated: 5, unmatched: 3 }, NOW);
    expect(r).toEqual({ ok: true, value: { ranAt: NOW, emailsChecked: 42 } });
  });

  it("uses the agent's own time when it is a real past time", () => {
    const r = cleanImportRun({ emailsChecked: 1, ranAt: "2026-10-08T04:00:00Z" }, NOW);
    expect(r.ok && r.value.ranAt.toISOString()).toBe("2026-10-08T04:00:00.000Z");
  });

  it("allows a few minutes of clock difference but not a time in the future", () => {
    expect(cleanImportRun({ emailsChecked: 1, ranAt: "2026-10-08T10:05:00Z" }, NOW).ok).toBe(true);
    expect(cleanImportRun({ emailsChecked: 1, ranAt: "2026-10-09T10:00:00Z" }, NOW)).toEqual({ ok: false, error: `"ranAt" is in the future.` });
  });

  it("rejects bad times", () => {
    for (const ranAt of ["yesterday", 5, "1999-01-01T00:00:00Z"]) expect(cleanImportRun({ emailsChecked: 1, ranAt }, NOW).ok).toBe(false);
  });

  it("rejects a missing, negative, fractional, huge or non-number email count; zero is fine", () => {
    expect(cleanImportRun({}, NOW).ok).toBe(false);
    for (const bad of [-1, 1.5, "7", null, 1_000_001, NaN]) expect(cleanImportRun({ emailsChecked: bad }, NOW).ok).toBe(false);
    expect(cleanImportRun({ emailsChecked: 0 }, NOW).ok).toBe(true);
  });

  it("rejects anything that is not an object", () => {
    for (const bad of [null, [], "x", 3]) expect(cleanImportRun(bad, NOW).ok).toBe(false);
  });
});

describe("formatRunTime", () => {
  it("shows Israel time (UTC+3 in summer, UTC+2 in winter)", () => {
    expect(formatRunTime(new Date("2026-10-08T04:05:00Z"))).toBe("08 Oct 2026, 07:05");
    expect(formatRunTime(new Date("2026-12-06T05:00:00Z"))).toBe("06 Dec 2026, 07:00");
  });
});

describe("agent instructions", () => {
  const text = agentInstructions("https://example.com/api/intake/suggestions");

  it("name both bookkeeping tools and their address", () => {
    expect(text).toContain("get_last_import");
    expect(text).toContain("record_import_run");
    expect(text).toContain("https://example.com/api/intake/import-run");
  });

  it("tell the agent to leave counting to the tracker, to send customer-related emails without a project, and to skip irrelevant ones", () => {
    expect(text).toContain("the tracker counts those itself");
    expect(text).toContain("leave the project out");
    expect(text).toContain("send nothing");
  });
});
