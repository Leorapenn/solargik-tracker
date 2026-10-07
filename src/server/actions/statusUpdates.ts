"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import { setPhaseUpdate, setProjectSummary, setSubStageUpdate } from "@/server/services/statusUpdates";

function refresh() {
  revalidatePath("/projects", "layout");
  revalidatePath("/phases");
}

export async function savePhaseUpdate(phaseId: string, text: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await setPhaseUpdate(phaseId, text);
    refresh();
    return {};
  });
}

export async function saveSubStageUpdate(subStageId: string, text: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await setSubStageUpdate(subStageId, text);
    refresh();
    return {};
  });
}

// Empty text goes back to the automatic summary.
export async function saveProjectSummary(projectId: string, text: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await setProjectSummary(projectId, text);
    refresh();
    return {};
  });
}
