import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { getUpdatesInRange, toExportRows } from "./weeklyUpdates";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("getUpdatesInRange", () => {
  let customerId: string;
  let projectId: string;
  let phaseId: string;
  let itemIds: string[];

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const project = await createProject({ name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    const design = project.phases.find((p) => p.name === "DESIGN")!;
    phaseId = design.id;
    itemIds = design.subStages.map((s) => s.id);
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  const mine = async (from: string, to: string) => (await getUpdatesInRange({ from, to })).find((p) => p.id === projectId);

  it("lists phase and item updates dated inside the range, newest first, and nothing outside it", async () => {
    await prisma.phase.update({ where: { id: phaseId }, data: { statusUpdate: "Phase is waiting on geotech", statusUpdateAt: day("2026-10-01") } });
    await prisma.subStage.update({ where: { id: itemIds[0] }, data: { statusUpdate: "Layout sent", statusUpdateAt: day("2026-10-03") } });
    await prisma.subStage.update({ where: { id: itemIds[1] }, data: { statusUpdate: "Old news", statusUpdateAt: day("2026-09-01") } });

    const found = await mine("2026-09-27", "2026-10-03"); // both edges included
    expect(found?.entries.map((e) => [e.level, e.text, e.date])).toEqual([
      ["Item", "Layout sent", "2026-10-03"],
      ["Phase", "Phase is waiting on geotech", "2026-10-01"],
    ]);
    expect(found?.summary.manual).toBe(false);

    expect(await mine("2026-10-04", "2026-10-10")).toBeUndefined();
    expect((await mine("2026-09-01", "2026-09-01"))?.entries).toHaveLength(1);
  });

  it("turns them into export rows", async () => {
    const found = await getUpdatesInRange({ from: "2026-09-27", to: "2026-10-03" });
    const rows = toExportRows(found.filter((p) => p.id === projectId));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ level: "Item", update: "Layout sent", status: "Not started", date: "2026-10-03" });
    expect(rows[1]).toMatchObject({ level: "Phase", item: "", update: "Phase is waiting on geotech" });
  });
});
