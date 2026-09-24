"use server";

import { revalidatePath } from "next/cache";
import type { StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Deliberately no gating here: a later phase can move to IN_PROGRESS while an
// earlier one is still IN_PROGRESS or BLOCKED (see createProject.test.ts).
export async function updatePhaseStatus(phaseId: string, status: StageStatus) {
  const phase = await prisma.phase.update({
    where: { id: phaseId },
    data: { status },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${phase.projectId}`);
  revalidatePath("/projects");
}

export async function updateSubStageStatus(subStageId: string, status: StageStatus) {
  const subStage = await prisma.subStage.update({
    where: { id: subStageId },
    data: { status },
    select: { phase: { select: { projectId: true } } },
  });
  revalidatePath(`/projects/${subStage.phase.projectId}`);
}
