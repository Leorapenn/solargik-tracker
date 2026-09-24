import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject, PHASE_ORDER } from "./createProject";

const TEST_RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("createProject", () => {
  let customerId: string;

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);

    const customer = await prisma.customer.create({
      data: { name: `Test Customer ${TEST_RUN_ID}` },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    // Deleting the customer's projects cascades to their phases and
    // sub-stages (onDelete: Cascade in schema.prisma).
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("creates all six phases in order with sub-stages from active templates", async () => {
    const project = await createProject({
      name: `Test Project ${TEST_RUN_ID}`,
      mondayItemId: `monday-${TEST_RUN_ID}`,
      customerId,
    });

    expect(project.phases).toHaveLength(6);
    expect(project.phases.map((phase) => phase.name)).toEqual(PHASE_ORDER);

    const initiation = project.phases.find((phase) => phase.name === "INITIATION");
    expect(initiation?.subStages.map((s) => s.name).sort()).toEqual(
      ["Contract Signing & Project Opening", "Customer Kickoff", "Internal Kickoff"].sort(),
    );

    const totalSubStages = project.phases.reduce((sum, phase) => sum + phase.subStages.length, 0);
    expect(totalSubStages).toBe(27);
  });

  it("ignores inactive templates when generating sub-stages", async () => {
    const template = await prisma.subStageTemplate.findFirstOrThrow({
      where: { phase: "INITIATION" },
    });
    await prisma.subStageTemplate.update({ where: { id: template.id }, data: { active: false } });

    try {
      const project = await createProject({
        name: `Test Project Inactive ${TEST_RUN_ID}`,
        mondayItemId: `monday-inactive-${TEST_RUN_ID}`,
        customerId,
      });

      const initiation = project.phases.find((phase) => phase.name === "INITIATION");
      expect(initiation?.subStages.some((s) => s.templateId === template.id)).toBe(false);
    } finally {
      await prisma.subStageTemplate.update({ where: { id: template.id }, data: { active: true } });
    }
  });

  it("allows a later phase to be IN_PROGRESS while an earlier phase is IN_PROGRESS or BLOCKED", async () => {
    const project = await createProject({
      name: `Test Project Concurrency ${TEST_RUN_ID}`,
      mondayItemId: `monday-concurrency-${TEST_RUN_ID}`,
      customerId,
    });

    const initiation = project.phases.find((phase) => phase.name === "INITIATION")!;
    const design = project.phases.find((phase) => phase.name === "DESIGN")!;
    const supply = project.phases.find((phase) => phase.name === "SUPPLY")!;

    await prisma.phase.update({ where: { id: initiation.id }, data: { status: "BLOCKED" } });
    await prisma.phase.update({ where: { id: design.id }, data: { status: "IN_PROGRESS" } });

    // Nothing in the model or service prevents a later phase (SUPPLY) from
    // moving to IN_PROGRESS while an earlier phase is still IN_PROGRESS or
    // BLOCKED — phase progression is tracked independently, not gated.
    const updatedSupply = await prisma.phase.update({
      where: { id: supply.id },
      data: { status: "IN_PROGRESS" },
    });

    const [reloadedInitiation, reloadedDesign] = await Promise.all([
      prisma.phase.findUniqueOrThrow({ where: { id: initiation.id } }),
      prisma.phase.findUniqueOrThrow({ where: { id: design.id } }),
    ]);

    expect(reloadedInitiation.status).toBe("BLOCKED");
    expect(reloadedDesign.status).toBe("IN_PROGRESS");
    expect(updatedSupply.status).toBe("IN_PROGRESS");
  });
});
