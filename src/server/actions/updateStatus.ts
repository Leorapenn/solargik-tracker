"use server";

import { revalidatePath } from "next/cache";
import type { StageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { parseDateInput } from "@/lib/dates";
import { run, UserError, type ActionResult } from "@/lib/errors";
import { patchSubStages, type SubStagePatch } from "@/server/services/subStages";

const MAX_ITEMS = 1000;
const STATUSES: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

// Dates travel as "YYYY-MM-DD" strings (what <input type="date"> produces); null/"" clears.
export type PatchInput = {
  status?: StageStatus;
  ownerId?: string | null;
  targetDate?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type BulkResult = ActionResult<{ updated: number; skippedCompletedDate: number; items?: number }>;

function date(value: string | null | undefined): Date | null {
  try {
    return parseDateInput(value);
  } catch {
    throw new UserError("That isn't a valid date.");
  }
}

function toPatch(input: PatchInput): SubStagePatch {
  const patch: SubStagePatch = {};
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new UserError("Invalid status.");
    patch.status = input.status;
  }
  if (input.ownerId !== undefined) {
    if (input.ownerId !== null && typeof input.ownerId !== "string") throw new UserError("Invalid owner.");
    patch.ownerId = input.ownerId || null;
  }
  if (input.targetDate !== undefined) patch.targetDate = date(input.targetDate);
  if (input.startedAt !== undefined) patch.startedAt = date(input.startedAt);
  if (input.completedAt !== undefined) patch.completedAt = date(input.completedAt);
  return patch;
}

function checkIds(ids: string[]) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new UserError("Invalid selection.");
  if (ids.length === 0) throw new UserError("Nothing is selected.");
  if (ids.length > MAX_ITEMS) throw new UserError(`Select at most ${MAX_ITEMS} at a time.`);
}

function refresh(projectIds: string[]) {
  for (const id of projectIds) revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  revalidatePath("/phases");
  revalidatePath("/customers", "layout");
}

// Sub-stages are what people edit; a phase's status is derived from them (see patchSubStages).
// Phases still don't gate each other: a later phase can be running while an earlier one is open.
export async function updateSubStageStatus(subStageId: string, status: StageStatus) {
  await requireActionAuth();
  const patch = toPatch({ status });
  const result = await prisma.$transaction((tx) => patchSubStages(tx, [subStageId], patch, "site"), {
    timeout: 20000,
  });
  refresh(result.projectIds);
}

// Several items at once: status, owner and/or dates (project page multi-select and single edits).
export async function updateSubStages(subStageIds: string[], input: PatchInput): Promise<BulkResult> {
  await requireActionAuth();
  return run(async () => {
    checkIds(subStageIds);
    const patch = toPatch(input);
    const result = await prisma.$transaction(
      (tx) => patchSubStages(tx, subStageIds, patch, subStageIds.length > 1 ? "bulk" : "site"),
      { timeout: 30000, maxWait: 10000 },
    );
    refresh(result.projectIds);
    return { updated: result.updated, skippedCompletedDate: result.skippedCompletedDate };
  });
}

// Whole phases across projects (Phases tab multi-select): applies to every item inside them.
export async function updatePhases(phaseIds: string[], input: PatchInput): Promise<BulkResult> {
  await requireActionAuth();
  return run(async () => {
    checkIds(phaseIds);
    const patch = toPatch(input);
    const result = await prisma.$transaction(
      async (tx) => {
        const items = await tx.subStage.findMany({ where: { phaseId: { in: phaseIds } }, select: { id: true } });
        if (items.length > 5000) throw new UserError("That selection is too large; choose fewer phases.");
        const patched = await patchSubStages(tx, items.map((i) => i.id), patch, "phase-bulk");
        return { ...patched, items: items.length };
      },
      { timeout: 60000, maxWait: 10000 },
    );
    refresh(result.projectIds);
    return { updated: result.updated, skippedCompletedDate: result.skippedCompletedDate, items: result.items };
  });
}
