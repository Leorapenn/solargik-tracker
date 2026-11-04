import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { MondayShipmentItem } from "@/lib/shipmentFromMonday";
import { applyShipmentImport, planShipmentImport } from "./shipmentImport";
import { listShipments } from "./shipments";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const NUMBER = 9871; // a project number nobody uses
const FILE = (id: number, name: string) => `https://solargikcrm.monday.com/protected_static/6995427/resources/${id}/${name}`;

const item = (id: string, name: string, values: MondayShipmentItem["values"]): MondayShipmentItem => ({ id, name, group: { id: "g", title: `${NUMBER} - PRJ (Test)` }, values });

describe("importing the monday.com shipping board", () => {
  let customerId: string;
  let projectId: string;

  beforeAll(async () => {
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await prisma.project.create({ data: { name: `${NUMBER}-Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId } })).id;
  });

  afterAll(async () => {
    // every cleanup is scoped by an id that exists; an undefined id would otherwise match every row
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } }); // its shipments go with it
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  const items = [
    item("9000000001", `${NUMBER}-PRJ / Shipment #1`, {
      status: "Arrive to the WH", timeline: "2026-06-01 - 2026-06-10", arrival: "2026-06-12", containers: "TCNU5368259 BHCU3190171", what: "Pylons", port: "Salerno", shipper: "Huade", method: "LCL",
      files: `${FILE(1, "Packing%20list.xlsx")}, ${FILE(2, "BL.pdf")}`,
    }),
    item("9000000002", `${NUMBER}-PRJ / Shipment #2`, { status: "Mystery label", timeline: "2026-07-01 - 2026-07-20", files: FILE(3, "Draft.pdf") }),
    item("9000000003", `${NUMBER}-PRJ / Shipment #3`, { status: "Arrive to the site", arrival: "2026-08-01", containers: "MSKU1234567", files: "" }),
    { ...item("9000000004", "9872-PRJ / Shipment #1", { status: "Done", arrival: "2026-08-01" }), group: { id: "g2", title: "9872 - PRJ (Not asked for)" } },
  ];

  it("creates what is not there, links the shipment that shares a container, keeps what was typed, and fills the empty fields", async () => {
    // a shipment someone added by hand (or an email proposed), with a container that is also on monday.com
    await prisma.shipment.create({ data: { projectId, reference: "PO 1", containers: ["TCNU5368259"], status: "DELIVERY_PLANNED", forwarder: "Viamar", notes: "typed note" } });

    const plan = await planShipmentImport(items, [NUMBER]);
    expect(plan.noProject).toEqual([]);
    const actions = plan.projects[0].actions;
    expect(actions.map((a) => [a.item.id, a.kind])).toEqual([
      ["9000000001", "link"],
      ["9000000002", "create"],
      ["9000000003", "create"],
    ]);
    expect(actions[1].imp.issues.join(" ")).toMatch(/Mystery label/);

    expect(await applyShipmentImport(plan)).toEqual({ created: 2, linked: 1, refreshed: 0, skipped: 0 });
    const list = await listShipments(projectId);
    expect(list).toHaveLength(3);

    const linked = list.find((s) => s.reference === "PO 1")!;
    expect(linked).toMatchObject({ status: "DELIVERY_PLANNED", forwarder: "Viamar", notes: "typed note", goods: "Pylons", portOfDischarge: "Salerno", etd: "2026-06-01", eta: "2026-06-10", shipper: "Huade", shippingMethod: "LCL" });
    expect(linked.containers).toEqual(["TCNU5368259", "BHCU3190171"]);
    expect(linked.files.map((f) => f.name)).toEqual(["Packing list.xlsx", "BL.pdf"]);
    expect(linked.mondayUrl).toBe("https://solargikcrm.monday.com/boards/6652155567/pulses/9000000001");

    const stuck = list.find((s) => s.reference === `${NUMBER}-PRJ / Shipment #2`)!;
    expect(stuck).toMatchObject({ status: "BOOKED", notes: "monday.com status: Mystery label" });
    expect(stuck.files).toHaveLength(1);
    const site = list.find((s) => s.reference === `${NUMBER}-PRJ / Shipment #3`)!;
    expect(site).toMatchObject({ status: "DELIVERED", deliveredAt: "2026-08-01", containers: ["MSKU1234567"], files: [] });
  });

  it("is safe to run again: nothing is added twice, hand edits made since are kept, the links are refreshed", async () => {
    await prisma.shipment.updateMany({ where: { projectId, reference: `${NUMBER}-PRJ / Shipment #2` }, data: { status: "IN_TRANSIT", notes: "edited by hand" } });
    const plan = await planShipmentImport(items, [NUMBER]);
    expect(plan.projects[0].actions.map((a) => a.kind)).toEqual(["refresh", "refresh", "refresh"]);
    expect(await applyShipmentImport(plan)).toEqual({ created: 0, linked: 0, refreshed: 3, skipped: 0 });
    const list = await listShipments(projectId);
    expect(list).toHaveLength(3);
    expect(list.find((s) => s.reference.endsWith("#2"))).toMatchObject({ status: "IN_TRANSIT", notes: "edited by hand" });
    expect(await prisma.shipment.count({ where: { projectId, mondayItemId: { not: null } } })).toBe(3);
  });

  it("only touches the projects asked for, and says when a number has no project", async () => {
    const plan = await planShipmentImport(items, [NUMBER, 9873]);
    expect(plan.noProject).toEqual([9873]);
    expect(plan.projects.map((p) => p.number)).toEqual([NUMBER]);
    expect((await planShipmentImport(items, [])).projects).toEqual([]);
  });
});
