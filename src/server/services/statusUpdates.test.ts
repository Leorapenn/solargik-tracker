import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { todayInAppTz } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { createProject } from "./createProject";
import { setPhaseUpdate, setProjectSummary, setSubStageUpdate } from "./statusUpdates";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("status updates", () => {
  let customerId: string;
  let projectId: string;
  let phaseId: string;

  const phase = () => prisma.phase.findUniqueOrThrow({ where: { id: phaseId } });
  const project = () => prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const created = await createProject({ name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = created.id;
    phaseId = created.phases.find((p) => p.name === "DESIGN")!.id;
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("stamps today's date when a phase update is saved, and keeps it when the text is unchanged", async () => {
    await setPhaseUpdate(phaseId, "  Waiting on the geotech report  ");
    let row = await phase();
    expect(row.statusUpdate).toBe("Waiting on the geotech report");
    expect(row.statusUpdateAt).toEqual(todayInAppTz());

    // pretend it was written earlier: saving the same text must not move the date
    const earlier = new Date("2026-01-05T00:00:00.000Z");
    await prisma.phase.update({ where: { id: phaseId }, data: { statusUpdateAt: earlier } });
    await setPhaseUpdate(phaseId, "Waiting on the geotech report");
    expect((await phase()).statusUpdateAt).toEqual(earlier);

    await setPhaseUpdate(phaseId, "Geotech report received");
    row = await phase();
    expect(row.statusUpdate).toBe("Geotech report received");
    expect(row.statusUpdateAt).toEqual(todayInAppTz());
  });

  it("clears the date together with the text", async () => {
    await setPhaseUpdate(phaseId, "   ");
    expect(await phase()).toMatchObject({ statusUpdate: null, statusUpdateAt: null });
  });

  it("rejects over-long text and unknown phases", async () => {
    await expect(setPhaseUpdate(phaseId, "x".repeat(5001))).rejects.toBeInstanceOf(UserError);
    await expect(setPhaseUpdate("nope", "hi")).rejects.toBeInstanceOf(UserError);
  });

  it("keeps a dated update on a sub-phase, with the same rules as a phase", async () => {
    const item = await prisma.subStage.findFirstOrThrow({ where: { phaseId } });
    const row = () => prisma.subStage.findUniqueOrThrow({ where: { id: item.id } });

    await setSubStageUpdate(item.id, "  Drawings sent to the customer  ");
    expect(await row()).toMatchObject({ statusUpdate: "Drawings sent to the customer", statusUpdateAt: todayInAppTz() });

    const earlier = new Date("2026-02-02T00:00:00.000Z");
    await prisma.subStage.update({ where: { id: item.id }, data: { statusUpdateAt: earlier } });
    await setSubStageUpdate(item.id, "Drawings sent to the customer");
    expect((await row()).statusUpdateAt).toEqual(earlier);

    await setSubStageUpdate(item.id, "");
    expect(await row()).toMatchObject({ statusUpdate: null, statusUpdateAt: null });
    await expect(setSubStageUpdate("nope", "hi")).rejects.toBeInstanceOf(UserError);
  });

  it("stores a typed project summary and goes back to automatic when it is emptied", async () => {
    await setProjectSummary(projectId, "On hold until the permit is issued");
    expect((await project()).statusSummaryOverride).toBe("On hold until the permit is issued");
    await setProjectSummary(projectId, "");
    expect((await project()).statusSummaryOverride).toBeNull();
    await expect(setProjectSummary("nope", "hi")).rejects.toBeInstanceOf(UserError);
  });
});
