"use server";

import { revalidatePath } from "next/cache";
import type { StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { derivePhaseStatus } from "@/lib/phaseStatus";

// Sub-stages are the only manually edited status. The parent phase's status is
// recomputed from them in the same transaction. The phase row is locked first so
// two people checking off items in the same phase at once can't leave it stale.
// Phases still don't gate each other: a later phase can be in progress while an
// earlier one is open or blocked.
export async function updateSubStageStatus(subStageId: string, status: StageStatus) {
  await requireActionAuth();

  const projectId = await prisma.$transaction(
    async (tx) => {
      const subStage = await tx.subStage.findUniqueOrThrow({
        where: { id: subStageId },
        select: { phaseId: true, phase: { select: { projectId: true } } },
      });

      await tx.$queryRaw`SELECT id FROM "Phase" WHERE id = ${subStage.phaseId} FOR UPDATE`;
      await tx.subStage.update({ where: { id: subStageId }, data: { status } });

      const siblings = await tx.subStage.findMany({
        where: { phaseId: subStage.phaseId },
        select: { status: true },
      });
      const phaseStatus = derivePhaseStatus(siblings.map((s) => s.status));
      if (phaseStatus) {
        await tx.phase.update({ where: { id: subStage.phaseId }, data: { status: phaseStatus } });
      }

      return subStage.phase.projectId;
    },
    { timeout: 20000 },
  );

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/customers");
  revalidatePath("/phases");
}
