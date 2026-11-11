import { describe, expect, it } from "vitest";
import { proposeDeliveryDone, type ShipmentFact, type SubStageFact } from "./deliveryProposal";

const ship = (extra: Partial<ShipmentFact> = {}): ShipmentFact => ({ reference: "S1", status: "DELIVERED", categories: ["TRACKER_STRUCTURE"], completionShipment: true, deliveredAt: "2026-10-03", ...extra });
const stage = (name: string, status = "NOT_STARTED", completedAt: string | null = null): SubStageFact => ({ id: `id-${name}`, name, status, completedAt });
const SUB = () => [stage("Delivery – Piles"), stage("Delivery – Tracker Structure"), stage("Delivery – Drive Units & I&C"), stage("Supply Completion")];

describe("a Delivery sub-stage is suggested", () => {
  it("when every shipment of its goods is delivered (one is the completion shipment): on the day of the last delivery", () => {
    const p = proposeDeliveryDone([ship({ reference: "A", deliveredAt: "2026-09-01", completionShipment: false }), ship({ reference: "B", deliveredAt: "2026-10-03" })], SUB());
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ key: "TRACKER_STRUCTURE", itemName: "Delivery – Tracker Structure", subStageId: "id-Delivery – Tracker Structure", completedOn: "2026-10-03" });
    expect(p[0].evidence).toEqual([{ label: "A", day: "2026-09-01" }, { label: "B", day: "2026-10-03" }]);
  });

  it("not while one of its shipments is still on its way, planned, or has no delivery day", () => {
    for (const other of [ship({ reference: "B", status: "IN_TRANSIT", deliveredAt: null }), ship({ reference: "B", status: "DELIVERY_PLANNED", deliveredAt: null }), ship({ reference: "B", status: "DELIVERED", deliveredAt: null }), ship({ reference: "B", status: "AWAITING_POD", deliveredAt: null })]) {
      expect(proposeDeliveryDone([ship(), other], SUB())).toEqual([]);
    }
  });

  it("without a completion shipment it is still suggested, marked as not flagged (more shipments may still come)", () => {
    const p = proposeDeliveryDone([ship({ completionShipment: false })], SUB());
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ key: "TRACKER_STRUCTURE", flagged: false, completedOn: "2026-10-03" });
    expect(proposeDeliveryDone([ship()], SUB())[0].flagged).toBe(true);
  });

  it("not when no shipment carries its goods, or the sub-stage is already Done or N/A", () => {
    expect(proposeDeliveryDone([], SUB())).toEqual([]);
    expect(proposeDeliveryDone([ship({ categories: [] })], SUB())).toEqual([]);
    expect(proposeDeliveryDone([ship()], SUB().map((s) => (s.name.includes("Structure") ? { ...s, status: "DONE", completedAt: "2026-10-05" } : s)).filter((s) => s.name !== "Supply Completion"))).toEqual([]);
    expect(proposeDeliveryDone([ship()], SUB().map((s) => (s.name.includes("Structure") ? { ...s, status: "NOT_APPLICABLE" } : s)))).toEqual([]);
    expect(proposeDeliveryDone([ship()], [stage("Something else")])).toEqual([]);
  });

  it("a shipment can carry several kinds of goods, each sub-stage looked at on its own", () => {
    const mixed = ship({ reference: "M", categories: ["TRACKER_STRUCTURE", "DRIVE_UNITS_IC"] });
    const drive = ship({ reference: "D", categories: ["DRIVE_UNITS_IC"], status: "IN_TRANSIT", deliveredAt: null, completionShipment: false });
    const p = proposeDeliveryDone([mixed, drive], SUB());
    expect(p.map((x) => x.key)).toEqual(["TRACKER_STRUCTURE"]); // drive units still have a shipment on its way
  });
});

describe("Supply Completion", () => {
  it("is suggested once the Delivery sub-stages that apply are Done, on the latest completed day", () => {
    const subs = [stage("Delivery – Piles", "NOT_APPLICABLE"), stage("Delivery – Tracker Structure", "DONE", "2026-10-03"), stage("Delivery – Drive Units & I&C", "DONE", "2026-10-07"), stage("Supply Completion")];
    const p = proposeDeliveryDone([], subs);
    expect(p).toEqual([expect.objectContaining({ key: "SUPPLY_COMPLETION", itemName: "Supply Completion", completedOn: "2026-10-07" })]);
  });
  it("not while one of them is open, when none is Done, when it is already Done, or when no completed day is known", () => {
    expect(proposeDeliveryDone([], [stage("Delivery – Piles", "DONE", "2026-01-01"), stage("Delivery – Tracker Structure"), stage("Supply Completion")])).toEqual([]);
    expect(proposeDeliveryDone([], [stage("Delivery – Piles", "NOT_APPLICABLE"), stage("Delivery – Tracker Structure", "NOT_APPLICABLE"), stage("Supply Completion")])).toEqual([]);
    expect(proposeDeliveryDone([], [stage("Delivery – Tracker Structure", "DONE", "2026-01-01"), stage("Supply Completion", "DONE", "2026-02-01")])).toEqual([]);
    expect(proposeDeliveryDone([], [stage("Delivery – Tracker Structure", "DONE", null), stage("Supply Completion")])).toEqual([]);
  });
});
