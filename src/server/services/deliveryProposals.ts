import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue } from "@/lib/dates";
import { proposeDeliveryDone, type DeliveryProposal } from "@/lib/deliveryProposal";
import { patchSubStages } from "@/server/services/subStages";

const iso = (d: Date | null) => (d ? toDateInputValue(d) : null);

// The Supply sub-stages that could be marked Done because their shipments are delivered (see src/lib/deliveryProposal.ts). Computed
// from what is in the database each time: nothing is stored, and nothing changes until a manager accepts one.
export async function getDeliveryProposals(projectId: string): Promise<DeliveryProposal[]> {
  const [shipments, subStages] = await Promise.all([
    prisma.shipment.findMany({ where: { projectId }, select: { reference: true, status: true, categories: true, completionShipment: true, deliveredAt: true } }),
    prisma.subStage.findMany({ where: { phase: { projectId, name: "SUPPLY" } }, select: { id: true, name: true, status: true, completedAt: true } }),
  ]);
  return proposeDeliveryDone(
    shipments.map((s) => ({ reference: s.reference, status: s.status, categories: s.categories, completionShipment: s.completionShipment, deliveredAt: iso(s.deliveredAt) })),
    subStages.map((s) => ({ id: s.id, name: s.name, status: s.status, completedAt: iso(s.completedAt) })),
  );
}

// Accepts one suggestion: the sub-stage is set to Done with the day of the last delivery as its completed day, through the same path as a
// change by hand (dates stamped, history written, the phase's status worked out again). The suggestion is worked out AGAIN here, so a
// stale page or a forged request can only apply what is still suggested.
export async function applyDeliveryProposal(projectId: string, key: string): Promise<string> {
  const proposal = (await getDeliveryProposals(projectId)).find((p) => p.key === key);
  if (!proposal) throw new UserError("That suggestion no longer applies (a shipment changed or the sub-stage was already updated). Reload the page.");
  await prisma.$transaction((tx) => patchSubStages(tx, [proposal.subStageId], { status: "DONE", completedAt: new Date(`${proposal.completedOn}T00:00:00.000Z`) }, "shipments"), { timeout: 20000 });
  return `"${proposal.itemName}" set to Done, completed ${proposal.completedOn}.`;
}
