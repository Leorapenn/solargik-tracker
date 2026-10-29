import { describe, expect, it } from "vitest";
import { rollupPhase, type RollupItem } from "./phaseRollup";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const today = d("2026-10-05");
const item = (over: Partial<RollupItem> = {}): RollupItem => ({
  status: "NOT_STARTED",
  ownerName: null,
  targetDate: null,
  startedAt: null,
  completedAt: null,
  ...over,
});

describe("rollupPhase", () => {
  it("handles a phase with no items", () => {
    expect(rollupPhase([], today)).toMatchObject({ total: 0, done: 0, startedAt: null, completedAt: null, owners: [] });
  });

  it("does not count N/A items: not in the total, never overdue, no dates from them", () => {
    const r = rollupPhase(
      [
        item({ status: "DONE", completedAt: d("2026-09-20") }),
        item({ status: "NOT_APPLICABLE", targetDate: d("2026-08-01"), ownerName: "Amit" }),
      ],
      today,
    );
    expect(r).toMatchObject({ total: 1, done: 1, overdueSince: null, doneWithoutDate: 0 });
    expect(r.completedAt).toEqual(d("2026-09-20")); // the phase is complete: the N/A item does not hold it back
    expect(r.targetDate).toBeNull();
    // a phase of only N/A items
    expect(rollupPhase([item({ status: "NOT_APPLICABLE" })], today)).toMatchObject({ total: 0, done: 0, completedAt: null });
  });

  it("uses the earliest start and the latest target", () => {
    const r = rollupPhase(
      [
        item({ status: "IN_PROGRESS", startedAt: d("2026-09-10"), targetDate: d("2026-11-01") }),
        item({ status: "DONE", startedAt: d("2026-09-01"), completedAt: d("2026-09-20"), targetDate: d("2026-12-01") }),
      ],
      today,
    );
    expect(r.startedAt).toEqual(d("2026-09-01"));
    expect(r.targetDate).toEqual(d("2026-12-01"));
    expect(r.completedAt).toBeNull(); // not every item is done
    expect(r.done).toBe(1);
  });

  it("reports the completion date only when every item is done (the latest one)", () => {
    const r = rollupPhase(
      [
        item({ status: "DONE", completedAt: d("2026-09-20") }),
        item({ status: "DONE", completedAt: d("2026-09-28") }),
      ],
      today,
    );
    expect(r.completedAt).toEqual(d("2026-09-28"));
  });

  it("flags done items that have no recorded date", () => {
    const r = rollupPhase([item({ status: "DONE" }), item({ status: "DONE", completedAt: d("2026-09-20") })], today);
    expect(r.doneWithoutDate).toBe(1);
  });

  it("does not flag a done item whose completed date is marked N/A", () => {
    const r = rollupPhase([item({ status: "DONE", naDates: ["completedAt"] }), item({ status: "DONE" })], today);
    expect(r.doneWithoutDate).toBe(1);
  });

  it("lists distinct owners alphabetically and ignores unassigned items", () => {
    const r = rollupPhase([item({ ownerName: "Yossi" }), item({ ownerName: "Dana" }), item({ ownerName: "Yossi" }), item()], today);
    expect(r.owners).toEqual(["Dana", "Yossi"]);
  });

  it("finds the earliest overdue target among unfinished items only", () => {
    const r = rollupPhase(
      [
        item({ targetDate: d("2026-09-01"), status: "DONE" }),
        item({ targetDate: d("2026-09-15") }),
        item({ targetDate: d("2026-09-10"), status: "IN_PROGRESS" }),
        item({ targetDate: d("2026-11-01") }),
      ],
      today,
    );
    expect(r.overdueSince).toEqual(d("2026-09-10"));
  });
});
