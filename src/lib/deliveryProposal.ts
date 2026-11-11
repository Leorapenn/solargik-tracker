import { DELIVERY_ITEMS, DELIVERY_ITEM_NAMES, type DeliveryItem } from "@/lib/shipmentCategory";

// When may a Supply "Delivery" sub-stage be suggested as Done? Pure rules; the project page shows the suggestion and a manager confirms
// it (nothing changes by itself).
//
// A Delivery sub-stage (Piles / Tracker Structure / Drive Units & I&C) is suggested when
//   1. at least one shipment carries its goods (the shipment's `categories`, from its packing list), and
//   2. EVERY shipment carrying them is Delivered, and
//   3. (the strong case) at least one of those shipments is flagged as a completion shipment (monday.com "Completion Shipment label = Yes":
//      the last shipment of an item). 360 does not know the full quantity, so without the flag "all shipments so far" could be too early:
//      it is still suggested, but marked `flagged: false` and worded as such (monday.com sets the flag on few shipments), and a manager confirms.
// The completed day is the day of the last of those deliveries. "Supply Completion" is suggested once the Delivery sub-stages that
// apply are all Done (the latest completed day).

export type ShipmentFact = { reference: string; status: string; categories: string[]; completionShipment: boolean; deliveredAt: string | null };
export type SubStageFact = { id: string; name: string; status: string; completedAt: string | null };

export type DeliveryProposal = {
  key: DeliveryItem | "SUPPLY_COMPLETION";
  subStageId: string;
  itemName: string;
  flagged: boolean; // a completion shipment is among them (a Delivery item); false = every shipment so far is delivered, but more may still come
  completedOn: string; // YYYY-MM-DD
  evidence: { label: string; day: string | null }[]; // what the suggestion rests on
};

export const SUPPLY_COMPLETION_NAME = "Supply Completion";
const isOpen = (s: SubStageFact) => s.status !== "DONE" && s.status !== "NOT_APPLICABLE";
const latest = (days: (string | null)[]): string | null => days.filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;

export function proposeDeliveryDone(shipments: ShipmentFact[], subStages: SubStageFact[]): DeliveryProposal[] {
  const out: DeliveryProposal[] = [];
  const byName = new Map(subStages.map((s) => [s.name, s]));

  for (const key of DELIVERY_ITEMS) {
    const item = byName.get(DELIVERY_ITEM_NAMES[key]);
    if (!item || !isOpen(item)) continue;
    const own = shipments.filter((s) => s.categories.includes(key));
    if (own.length === 0) continue;
    if (!own.every((s) => s.status === "DELIVERED" && s.deliveredAt)) continue;
    out.push({ key, subStageId: item.id, itemName: item.name, flagged: own.some((s) => s.completionShipment), completedOn: latest(own.map((s) => s.deliveredAt))!, evidence: own.map((s) => ({ label: s.reference, day: s.deliveredAt })) });
  }

  // Supply Completion: the Delivery items that apply are all Done (at least one is Done: a project whose Delivery items are all N/A has nothing to complete)
  const completion = byName.get(SUPPLY_COMPLETION_NAME);
  const delivery = DELIVERY_ITEMS.map((k) => byName.get(DELIVERY_ITEM_NAMES[k])).filter((s): s is SubStageFact => Boolean(s));
  if (completion && isOpen(completion) && delivery.length > 0 && delivery.every((s) => s.status === "DONE" || s.status === "NOT_APPLICABLE") && delivery.some((s) => s.status === "DONE")) {
    const day = latest(delivery.filter((s) => s.status === "DONE").map((s) => s.completedAt));
    if (day) out.push({ key: "SUPPLY_COMPLETION", subStageId: completion.id, itemName: completion.name, flagged: true, completedOn: day, evidence: delivery.filter((s) => s.status === "DONE").map((s) => ({ label: s.name, day: s.completedAt })) });
  }
  return out;
}
