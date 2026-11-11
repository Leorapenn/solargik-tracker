import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { saveShipment } from "./shipments";
import { applyDeliveryProposal, getDeliveryProposals } from "./deliveryProposals";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("suggesting the Delivery sub-stages from the shipments", () => {
  let customerId: string;
  let projectId: string;

  const item = (name: string) => prisma.subStage.findFirstOrThrow({ where: { name, phase: { projectId, name: "SUPPLY" } } });
  const shipment = (reference: string, extra: Record<string, unknown>) => saveShipment(projectId, null, { reference, ...extra });
  const flag = (reference: string, data: Record<string, unknown>) => prisma.shipment.updateMany({ where: { projectId, reference }, data });

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await createProject({ name: `9873-Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId })).id;
  });

  afterAll(async () => {
    // every cleanup is scoped by an id that exists; an undefined id would otherwise match every row
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } }); // its shipments and items go with it
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("suggests a sub-stage once all its shipments are delivered, accepts it with the last delivery day, and never twice", async () => {
    await shipment("A", { status: "DELIVERED", deliveredAt: "2026-09-01", categories: ["TRACKER_STRUCTURE"] });
    await shipment("B", { status: "DELIVERED", deliveredAt: "2026-10-03", categories: ["TRACKER_STRUCTURE"], completionShipment: true });
    await shipment("D", { status: "IN_TRANSIT", categories: ["DRIVE_UNITS_IC"] });

    let proposals = await getDeliveryProposals(projectId);
    expect(proposals.map((p) => [p.key, p.flagged, p.completedOn])).toEqual([["TRACKER_STRUCTURE", true, "2026-10-03"]]); // drive units still on their way

    const note = await applyDeliveryProposal(projectId, "TRACKER_STRUCTURE");
    expect(note).toBe('"Delivery – Tracker Structure" set to Done, completed 2026-10-03.');
    const done = await item("Delivery – Tracker Structure");
    expect(done.status).toBe("DONE");
    expect(done.completedAt?.toISOString().slice(0, 10)).toBe("2026-10-03");
    expect(await prisma.statusEvent.count({ where: { subStageId: done.id } })).toBeGreaterThan(0);

    proposals = await getDeliveryProposals(projectId);
    expect(proposals).toEqual([]);
    await expect(applyDeliveryProposal(projectId, "TRACKER_STRUCTURE")).rejects.toBeInstanceOf(UserError); // already applied
    await expect(applyDeliveryProposal(projectId, "PILES")).rejects.toBeInstanceOf(UserError); // nothing carries piles
  });

  it("without a completion flag it is still suggested, as not flagged; then Supply Completion follows the Delivery sub-stages", async () => {
    await flag("D", { status: "DELIVERED", deliveredAt: day("2026-10-20") });
    const proposals = await getDeliveryProposals(projectId);
    expect(proposals.map((p) => [p.key, p.flagged, p.completedOn])).toEqual([["DRIVE_UNITS_IC", false, "2026-10-20"]]);
    await applyDeliveryProposal(projectId, "DRIVE_UNITS_IC");

    // piles do not apply to this project: Supply Completion waits until they are N/A
    expect(await getDeliveryProposals(projectId)).toEqual([]);
    await prisma.subStage.update({ where: { id: (await item("Delivery – Piles")).id }, data: { status: "NOT_APPLICABLE" } });
    const next = await getDeliveryProposals(projectId);
    expect(next.map((p) => [p.key, p.completedOn])).toEqual([["SUPPLY_COMPLETION", "2026-10-20"]]);
    await applyDeliveryProposal(projectId, "SUPPLY_COMPLETION");
    expect((await item("Supply Completion")).status).toBe("DONE");
    expect(await getDeliveryProposals(projectId)).toEqual([]);
  });

  it("an edit of the Delivery sub-stages on the Shipments form is kept, and an email proposal leaves them alone", async () => {
    await shipment("E", { status: "BOOKED", categories: ["PILES", "nonsense", "PILES"], completionShipment: true });
    const row = await prisma.shipment.findFirstOrThrow({ where: { projectId, reference: "E" } });
    expect(row.categories).toEqual(["PILES"]); // only the known ones, once
    expect(row.completionShipment).toBe(true);
    // saving the shipment again without them (as an approved email proposal does) leaves them as they are
    await saveShipment(projectId, row.id, { reference: "E", status: "AT_PORT" });
    const again = await prisma.shipment.findUniqueOrThrow({ where: { id: row.id } });
    expect(again).toMatchObject({ status: "AT_PORT", categories: ["PILES"], completionShipment: true });
  });
});
