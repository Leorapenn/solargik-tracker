import { describe, expect, it } from "vitest";
import {
  deriveImportance,
  planContactSync,
  planCustomerUpdate,
  planProjectUpdate,
  type ExistingContact,
  type ProjectExisting,
  type ProjectIncoming,
} from "./importMerge";

const existing: ProjectExisting = {
  name: "257-Barge 2",
  customerId: "c1",
  contractValue: "1000000",
  capacityMw: "9.408",
  country: "Italy",
  lifecycle: "ACTIVE",
  mondayStage: "4 Construction",
  mondayStatus: "Construction",
  lockedFields: [],
};
const incoming: ProjectIncoming = {
  name: "257-Barge 2",
  customerId: "c1",
  contractValue: 1000000,
  capacityMw: 9.408,
  country: "Italy",
  lifecycle: "ACTIVE",
  mondayStage: "4 Construction",
  mondayStatus: "Construction",
};

describe("planProjectUpdate", () => {
  it("plans nothing when nothing changed (idempotent re-import)", () => {
    expect(planProjectUpdate(existing, incoming)).toEqual({});
  });

  it("applies monday's changes to unlocked fields", () => {
    expect(planProjectUpdate(existing, { ...incoming, contractValue: 1200000, country: "Greece" })).toEqual({
      contractValue: 1200000,
      country: "Greece",
    });
  });

  it("never overwrites a field that was edited by hand", () => {
    const locked = { ...existing, lockedFields: ["contractValue", "lifecycle"] };
    const plan = planProjectUpdate(locked, { ...incoming, contractValue: 1, lifecycle: "CANCELLED", country: "Greece" });
    expect(plan).toEqual({ country: "Greece" });
  });

  it("keeps the raw monday labels current even when the lifecycle is locked", () => {
    const locked = { ...existing, lockedFields: ["lifecycle"] };
    expect(planProjectUpdate(locked, { ...incoming, lifecycle: "SUSPENDED", mondayStage: "Suspended" })).toEqual({
      mondayStage: "Suspended",
    });
  });

  it("treats null and null as equal, and ignores float noise", () => {
    const nulls = { ...existing, contractValue: null, capacityMw: "4.4698" };
    expect(planProjectUpdate(nulls, { ...incoming, contractValue: null, capacityMw: 4.469800000001 })).toEqual({});
  });
});

describe("planCustomerUpdate / deriveImportance", () => {
  const base = { name: "Revalue", importance: "NORMAL" as const, lockedFields: [] as string[] };

  it("imports importance from monday when not locked", () => {
    expect(planCustomerUpdate(base, { name: "Revalue", importance: "STRATEGIC" })).toEqual({ importance: "STRATEGIC" });
  });

  it("leaves a hand-set importance and name alone", () => {
    const locked = { ...base, lockedFields: ["importance", "name"] };
    expect(planCustomerUpdate(locked, { name: "Revalue Srl", importance: "STRATEGIC" })).toEqual({});
  });

  it("keeps the current importance when monday has none", () => {
    expect(planCustomerUpdate(base, { name: "Revalue", importance: null })).toEqual({});
  });

  it("reads monday's labels", () => {
    expect(deriveImportance("Strategic")).toBe("STRATEGIC");
    expect(deriveImportance("Semi-Strategic")).toBe("SEMI_STRATEGIC");
    expect(deriveImportance(" normal ")).toBe("NORMAL");
    expect(deriveImportance("")).toBeNull();
    expect(deriveImportance(null)).toBeNull();
  });
});

describe("planContactSync", () => {
  const contact = (over: Partial<ExistingContact> & { slot: number }): ExistingContact => ({
    id: `id${over.slot}`,
    name: "Dana",
    email: "dana@x.com",
    role: "CEO",
    englishLevel: "Strong",
    customerId: "c1",
    locked: false,
    ...over,
  });
  const inc = (slot: number, name = "Dana") => ({ slot, name, email: "dana@x.com", role: "CEO", englishLevel: "Strong" });

  it("creates contacts for new slots", () => {
    expect(planContactSync([], [inc(1), inc(2, "Avi")], "c1").create.map((c) => c.slot)).toEqual([1, 2]);
  });

  it("updates changed imported contacts only", () => {
    const plan = planContactSync([contact({ slot: 1 }), contact({ slot: 2 })], [inc(1), inc(2, "Avi")], "c1");
    expect(plan.update.map((u) => u.id)).toEqual(["id2"]);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("removes imported contacts whose slot was cleared in monday", () => {
    expect(planContactSync([contact({ slot: 1 }), contact({ slot: 2 })], [inc(1)], "c1").remove).toEqual(["id2"]);
  });

  it("never touches a hand-edited (locked) contact, even if monday changed or cleared it", () => {
    const plan = planContactSync([contact({ slot: 1, locked: true }), contact({ slot: 2, locked: true })], [inc(1, "Someone Else")], "c1");
    expect(plan).toEqual({ create: [], update: [], remove: [] });
  });

  it("is idempotent", () => {
    expect(planContactSync([contact({ slot: 1 })], [inc(1)], "c1")).toEqual({ create: [], update: [], remove: [] });
  });

  it("moves contacts when the project's customer changes", () => {
    const plan = planContactSync([contact({ slot: 1, customerId: "old" })], [inc(1)], "c1");
    expect(plan.update[0].data.customerId).toBe("c1");
  });
});
