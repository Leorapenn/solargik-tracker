import type { PhaseName } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Fixed order the six phases are created in for every project, regardless
// of which phases end up with active sub-stage templates.
export const PHASE_ORDER: PhaseName[] = [
  "INITIATION",
  "DESIGN",
  "SUPPLY",
  "CONSTRUCTION",
  "COMMISSIONING",
  "OM",
];

export type CreateProjectInput = {
  name: string;
  mondayItemId: string;
  customerId: string;
  contractValue?: number | null;
  capacityMw?: number | null;
  country?: string | null;
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
      },
    });

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
