import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { todayInAppTz } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { createProject } from "./createProject";
import { patchSubStages, type SubStagePatch } from "./subStages";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("patchSubStages", () => {
  let customerId: string;
  let projectId: string;
  let personId: string;
  let designIds: string[];
  let supplyIds: string[];

  const patch = (ids: string[], p: SubStagePatch, source = "test") =>
    prisma.$transaction((tx) => patchSubStages(tx, ids, p, source), { timeout: 30000 });
  const item = (id: string) => prisma.subStage.findUniqueOrThrow({ where: { id } });
  const phaseStatus = async (name: "DESIGN" | "SUPPLY") =>
    (await prisma.phase.findUniqueOrThrow({ where: { projectId_name: { projectId, name } } })).status;

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const project = await createProject({ name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    personId = (await prisma.person.create({ data: { name: `Test Person ${RUN}` } })).id;
    const ids = (phase: string) => project.phases.find((p) => p.name === phase)!.subStages.map((s) => s.id);
    designIds = ids("DESIGN");
    supplyIds = ids("SUPPLY");
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.person.delete({ where: { id: personId } });
    await prisma.$disconnect();
  });

  it("records the start date and a history event when work starts, and updates the phase", async () => {
    await patch([designIds[0]], { status: "IN_PROGRESS" });
    const row = await item(designIds[0]);
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.startedAt).toEqual(todayInAppTz());
    expect(row.completedAt).toBeNull();
    expect(await phaseStatus("DESIGN")).toBe("IN_PROGRESS");

    const events = await prisma.statusEvent.findMany({ where: { subStageId: designIds[0] } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: "NOT_STARTED", toStatus: "IN_PROGRESS", source: "test" });
  });

  it("records the completed date, and marks the phase Done once every item is done", async () => {
    await patch(designIds, { status: "DONE" }, "bulk");
    for (const id of designIds) {
      const row = await item(id);
      expect(row.status).toBe("DONE");
      expect(row.completedAt).toEqual(todayInAppTz());
      expect(row.startedAt).not.toBeNull();
    }
    expect(await phaseStatus("DESIGN")).toBe("DONE");
  });

  it("clears the completed date but keeps the start date when an item is reopened", async () => {
    await patch([designIds[1]], { status: "BLOCKED" });
    const row = await item(designIds[1]);
    expect(row.completedAt).toBeNull();
    expect(row.startedAt).not.toBeNull();
    expect(await phaseStatus("DESIGN")).toBe("BLOCKED");
    // the full trail of changes is kept
    const events = await prisma.statusEvent.findMany({ where: { subStageId: designIds[1] }, orderBy: { at: "asc" } });
    expect(events.map((e) => e.toStatus)).toEqual(["DONE", "BLOCKED"]);
  });

  it("lets an explicit completed date override the automatic one", async () => {
    const date = new Date("2026-01-05T00:00:00.000Z");
    await patch([supplyIds[0]], { status: "DONE", completedAt: date });
    expect((await item(supplyIds[0])).completedAt).toEqual(date);
  });

  it("ignores a completed date for items that are not done, and says how many", async () => {
    const result = await patch([supplyIds[1], supplyIds[2]], { completedAt: new Date("2026-02-01T00:00:00.000Z") });
    expect(result.skippedCompletedDate).toBe(2);
    expect((await item(supplyIds[1])).completedAt).toBeNull();
  });

  it("assigns an owner and target date to many items at once", async () => {
    const target = new Date("2026-12-01T00:00:00.000Z");
    const result = await patch(supplyIds, { ownerId: personId, targetDate: target });
    expect(result.updated).toBe(supplyIds.length);
    for (const id of supplyIds) {
      const row = await item(id);
      expect(row.ownerId).toBe(personId);
      expect(row.targetDate).toEqual(target);
    }
  });

  it("rejects an owner that doesn't exist", async () => {
    await expect(patch([supplyIds[0]], { ownerId: "nobody" })).rejects.toBeInstanceOf(UserError);
  });

  it("does nothing, and records nothing, when the status is unchanged", async () => {
    const before = await prisma.statusEvent.count({ where: { subStageId: { in: supplyIds } } });
    const result = await patch([supplyIds[0]], { status: "DONE" });
    expect(result.updated).toBe(0);
    expect(await prisma.statusEvent.count({ where: { subStageId: { in: supplyIds } } })).toBe(before);
  });
});
