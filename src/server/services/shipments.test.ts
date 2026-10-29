import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { approveSuggestion, createSuggestions } from "./suggestions";
import { deleteShipment, listShipments, saveShipment } from "./shipments";
import { listProjectsForMatching } from "./intakeDirectory";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("shipments", () => {
  let customerId: string;
  let projectId: string;
  let otherProjectId: string;
  const suggestionIds: string[] = [];
  const emailLink = `https://outlook.office365.com/owa/?ItemID=${RUN}`;

  const propose = async (n: number, extra: Record<string, unknown>) => {
    const r = await createSuggestions([{ id: `${RUN}-${n}`, kind: "SHIPMENT_UPDATE", project: `Test Project ${RUN}`, summary: `Shipment ${n}`, source: { from: "renald@viamar.eu", subject: "Delivery goods", link: `${emailLink}-${n}` }, ...extra }]);
    const row = await prisma.suggestion.findUnique({ where: { externalId: `${RUN}-${n}` } });
    if (row) suggestionIds.push(row.id);
    return { r, row };
  };

  beforeAll(async () => {
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await prisma.project.create({ data: { name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId } })).id;
    otherProjectId = (await prisma.project.create({ data: { name: `Other Project ${RUN}`, mondayItemId: `monday-other-${RUN}`, customerId } })).id;
  });

  afterAll(async () => {
    // every cleanup is scoped by an id that exists; an undefined id would otherwise match every row
    if (suggestionIds.length) await prisma.suggestion.deleteMany({ where: { id: { in: suggestionIds } } });
    const ids = [projectId, otherProjectId].filter(Boolean);
    if (ids.length) await prisma.project.deleteMany({ where: { id: { in: ids } } }); // its shipments go with it
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("adds, edits and deletes a shipment by hand, with the rules checked", async () => {
    const id = await saveShipment(projectId, null, { reference: "  Shipment #01 ", goods: "Piles", containers: "tcnu 5368259, BHCU3190171", portOfDischarge: "Genoa", eta: "2026-11-09" });
    let list = await listShipments(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, reference: "Shipment #01", goods: "Piles", containers: ["TCNU5368259", "BHCU3190171"], status: "BOOKED", customsStatus: "NOT_STARTED", eta: "2026-11-09", portOfDischarge: "Genoa" });

    await saveShipment(projectId, id, { reference: "Shipment #01", status: "AT_PORT", customsStatus: "IN_PROGRESS", arrivedAt: "2026-10-20", eta: "2026-11-09", containers: "TCNU5368259" });
    list = await listShipments(projectId);
    expect(list[0]).toMatchObject({ status: "AT_PORT", customsStatus: "IN_PROGRESS", arrivedAt: "2026-10-20", containers: ["TCNU5368259"], goods: null });

    await expect(saveShipment(projectId, null, { reference: "" })).rejects.toBeInstanceOf(UserError);
    await expect(saveShipment(projectId, null, { reference: "x", containers: "nonsense" })).rejects.toBeInstanceOf(UserError);
    await expect(saveShipment(projectId, null, { reference: "x", status: "DELIVERED" })).rejects.toBeInstanceOf(UserError); // needs the delivery day
    await expect(saveShipment(projectId, "no-such-shipment", { reference: "x" })).rejects.toBeInstanceOf(UserError);
    await expect(saveShipment(otherProjectId, id, { reference: "x" })).rejects.toBeInstanceOf(UserError); // not that project's shipment
    await expect(saveShipment("no-such-project", null, { reference: "x" })).rejects.toBeInstanceOf(UserError);

    await expect(deleteShipment(otherProjectId, id)).rejects.toBeInstanceOf(UserError);
    await deleteShipment(projectId, id);
    expect(await listShipments(projectId)).toEqual([]);
  });

  it("a proposal adds the shipment only on approval, then later emails update the same one and containers are only added", async () => {
    const first = await propose(1, { reference: "PO 26000253", goods: "Pylons", forwarder: "Viamar", containers: ["TCNU5368259"], portOfDischarge: "Genoa", status: "delivery planned", notes: "Asked iAccess for the address" });
    expect(first.r).toMatchObject({ created: 1 });
    expect(first.row).toMatchObject({ status: "PENDING", projectId });
    expect(await listShipments(projectId)).toEqual([]); // nothing yet
    expect(await approveSuggestion(first.row!.id)).toBe('Shipment "PO 26000253" added to the project.');
    let list = await listShipments(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reference: "PO 26000253", goods: "Pylons", forwarder: "Viamar", status: "DELIVERY_PLANNED", customsStatus: "NOT_STARTED", containers: ["TCNU5368259"], sourceLink: `${emailLink}-1` });

    // the same reference (any case): updated, the second container added, what the email does not say is kept
    const second = await propose(2, { reference: "po 26000253", containers: ["BHCU3190171"], customsStatus: "cleared", customsClearedAt: "2026-10-28" });
    expect(await approveSuggestion(second.row!.id)).toBe('Shipment "PO 26000253" updated.');
    list = await listShipments(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reference: "PO 26000253", goods: "Pylons", status: "DELIVERY_PLANNED", customsStatus: "CLEARED", customsClearedAt: "2026-10-28", containers: ["TCNU5368259", "BHCU3190171"], notes: "Asked iAccess for the address", sourceLink: `${emailLink}-2` });

    // a different name but a container it already has: the same shipment
    const third = await propose(3, { reference: "Invoice 26BC317", containers: ["BHCU3190171"], deliveredAt: "2026-10-29", status: "DELIVERED" });
    expect(await approveSuggestion(third.row!.id)).toBe('Shipment "PO 26000253" updated.');
    list = await listShipments(projectId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reference: "PO 26000253", status: "DELIVERED", deliveredAt: "2026-10-29" });
  });

  it("refuses what it should and leaves the proposal waiting: a second shipment is not guessed, a delivery needs its day, a future arrival is refused", async () => {
    // a brand-new reference and containers: a second shipment
    const other = await propose(4, { reference: "Shipment #02", containers: ["MSKU1111111"], status: "in transit", eta: "2026-12-01" });
    await approveSuggestion(other.row!.id);
    expect(await listShipments(projectId)).toHaveLength(2);

    // delivered with no day: refused at approval, still pending
    const noDay = await propose(5, { reference: "Shipment #02", status: "delivered" });
    await expect(approveSuggestion(noDay.row!.id)).rejects.toBeInstanceOf(UserError);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: noDay.row!.id } })).status).toBe("PENDING");

    // an arrival in the future is not a fact
    const future = await propose(6, { reference: "Shipment #02", arrivedAt: "2999-01-01" });
    await expect(approveSuggestion(future.row!.id)).rejects.toBeInstanceOf(UserError);

    // containers that belong to two shipments make the match unclear
    await saveShipment(projectId, null, { reference: "Shipment #03", containers: "MSKU1111111" });
    const unclear = await propose(7, { reference: "Brand new name", containers: ["MSKU1111111"], notes: "x" });
    await expect(approveSuggestion(unclear.row!.id)).rejects.toThrow(/Several shipments match/);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: unclear.row!.id } })).status).toBe("PENDING");

    // intake itself refuses a shipment with nothing but a name, and a bad container
    expect((await createSuggestions([{ kind: "SHIPMENT_UPDATE", reference: "A", summary: "s", id: `${RUN}-8` }])).rejected).toHaveLength(1);
    expect((await createSuggestions([{ kind: "SHIPMENT_UPDATE", reference: "A", containers: ["nope"], summary: "s", id: `${RUN}-9` }])).rejected).toHaveLength(1);
  });

  it("shows the agent each project's shipments by name, state, containers and expected arrival", async () => {
    const mine = (await listProjectsForMatching()).find((p) => p.id === projectId)!;
    expect(mine.shipments.map((s) => s.reference).sort()).toEqual(["PO 26000253", "Shipment #02", "Shipment #03"]);
    const po = mine.shipments.find((s) => s.reference === "PO 26000253")!;
    expect(po).toEqual({ reference: "PO 26000253", status: "DELIVERED", customsStatus: "CLEARED", containers: ["TCNU5368259", "BHCU3190171"], eta: null });
  });
});
