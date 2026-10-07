import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { UserError } from "@/lib/errors";
import { createProject } from "./createProject";
import { applyDefaultPhaseOwners, setPhaseDefaultOwner, setPhaseOwners } from "./phaseOwners";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("phase owners", () => {
  let customerId: string;
  let projectId: string;
  let phaseIds: Record<string, string>;
  let personId: string;
  let otherId: string;
  let inactiveId: string;
  // the real default for DESIGN (if any), put back at the end
  let savedDefault: { phase: "DESIGN"; personId: string } | null;

  const owner = async (name: "DESIGN" | "SUPPLY") => (await prisma.phase.findUniqueOrThrow({ where: { projectId_name: { projectId, name } } })).ownerId;

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const project = await createProject({ name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    phaseIds = Object.fromEntries(project.phases.map((p) => [p.name, p.id]));
    personId = (await prisma.person.create({ data: { name: `Test Person ${RUN}` } })).id;
    otherId = (await prisma.person.create({ data: { name: `Other Person ${RUN}` } })).id;
    inactiveId = (await prisma.person.create({ data: { name: `Inactive Person ${RUN}`, active: false } })).id;
    savedDefault = (await prisma.phaseDefaultOwner.findUnique({ where: { phase: "DESIGN" } })) as typeof savedDefault;
  });

  afterAll(async () => {
    await prisma.phaseDefaultOwner.deleteMany({ where: { phase: "DESIGN" } });
    if (savedDefault) await prisma.phaseDefaultOwner.create({ data: savedDefault });
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.person.deleteMany({ where: { id: { in: [personId, otherId, inactiveId] } } });
    await prisma.$disconnect();
  });

  it("sets and clears a phase owner without touching the owners of its items", async () => {
    const item = await prisma.subStage.findFirstOrThrow({ where: { phaseId: phaseIds.DESIGN } });
    await prisma.subStage.update({ where: { id: item.id }, data: { ownerId: otherId } });

    expect(await setPhaseOwners([phaseIds.DESIGN, phaseIds.SUPPLY], personId)).toBe(2);
    expect(await owner("DESIGN")).toBe(personId);
    expect(await owner("SUPPLY")).toBe(personId);
    expect((await prisma.subStage.findUniqueOrThrow({ where: { id: item.id } })).ownerId).toBe(otherId); // unchanged

    await setPhaseOwners([phaseIds.SUPPLY], null);
    expect(await owner("SUPPLY")).toBeNull();
  });

  it("refuses an inactive person, an empty list and unknown phases", async () => {
    await expect(setPhaseOwners([phaseIds.DESIGN], inactiveId)).rejects.toBeInstanceOf(UserError);
    await expect(setPhaseOwners([], personId)).rejects.toBeInstanceOf(UserError);
    await expect(setPhaseOwners(["nope"], personId)).rejects.toBeInstanceOf(UserError);
  });

  it("gives new projects the default phase owner, and fills only phases that have none", async () => {
    // (real default owners may exist for other phases, so only DESIGN is looked at, and only these test projects)
    await setPhaseDefaultOwner("DESIGN", personId);
    const fresh = await createProject({ name: `Test Project B ${RUN}`, mondayItemId: `monday-b-${RUN}`, customerId });
    expect(fresh.phases.find((p) => p.name === "DESIGN")!.ownerId).toBe(personId);

    // an existing phase with another owner keeps it; one with none is filled
    await setPhaseOwners([phaseIds.DESIGN], otherId);
    await prisma.phase.update({ where: { id: fresh.phases.find((p) => p.name === "DESIGN")!.id }, data: { ownerId: null } });
    await applyDefaultPhaseOwners([projectId, fresh.id]);
    expect(await owner("DESIGN")).toBe(otherId);
    const afterFill = await prisma.phase.findUniqueOrThrow({ where: { id: fresh.phases.find((p) => p.name === "DESIGN")!.id } });
    expect(afterFill.ownerId).toBe(personId);

    await setPhaseDefaultOwner("DESIGN", null);
    expect(await prisma.phaseDefaultOwner.count({ where: { phase: "DESIGN" } })).toBe(0);
    await expect(setPhaseDefaultOwner("NOPE" as never, personId)).rejects.toBeInstanceOf(UserError);
  });
});
