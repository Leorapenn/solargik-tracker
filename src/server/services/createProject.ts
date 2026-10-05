import type { ProjectLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PHASE_ORDER } from "@/lib/phases";

export { PHASE_ORDER };

export type CreateProjectInput = {
  name: string;
  mondayItemId: string;
  customerId: string;
  contractValue?: number | null;
  capacityMw?: number | null;
  country?: string | null;
  lifecycle?: ProjectLifecycle;
  mondayStage?: string | null;
  mondayStatus?: string | null;
};

export async function createProject(input: CreateProjectInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: input.name,
        mondayItemId: input.mondayItemId,
        customerId: input.customerId,
        contractValue: input.contractValue ?? null,
        capacityMw: input.capacityMw ?? null,
        country: input.country ?? null,
        lifecycle: input.lifecycle ?? "ACTIVE",
        mondayStage: input.mondayStage ?? null,
        mondayStatus: input.mondayStatus ?? null,
      },
    });

    // New items start owned by their department's default owner (managed on the People page), if set.
    const defaultOwners = new Map(
      (await tx.departmentOwner.findMany({ where: { person: { active: true } } })).map((o) => [o.department, o.personId]),
    );

    for (const [index, phaseName] of PHASE_ORDER.entries()) {
      const phase = await tx.phase.create({
        data: {
          projectId: project.id,
          name: phaseName,
          order: index + 1,
        },
      });

      const templates = await tx.subStageTemplate.findMany({
        where: { phase: phaseName, active: true },
        orderBy: { order: "asc" },
      });

      if (templates.length > 0) {
        await tx.subStage.createMany({
          data: templates.map((template) => ({
            phaseId: phase.id,
            templateId: template.id,
            name: template.name,
            department: template.department,
            order: template.order,
            ownerId: defaultOwners.get(template.department) ?? null,
            naDates: template.naDates,
          })),
        });
      }
    }

    return tx.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { phases: { include: { subStages: true }, orderBy: { order: "asc" } } },
    });
  }, { timeout: 20000 }); // default 5s is too tight for this many sequential round trips over a remote (Neon) connection
}
