"use server";

import { revalidatePath } from "next/cache";
import type { PhaseName } from "@prisma/client";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import { applyDefaultPhaseOwners, setPhaseDefaultOwner, setPhaseOwners } from "@/server/services/phaseOwners";

function refresh() {
  revalidatePath("/people");
  revalidatePath("/projects", "layout");
  revalidatePath("/phases");
}

// Sets (null clears) the owner of one or more whole phases; the phases' items keep their own owners.
export async function assignPhaseOwners(phaseIds: string[], personId: string | null): Promise<ActionResult<{ updated: number }>> {
  await requireActionAuth();
  return run(async () => {
    const updated = await setPhaseOwners(phaseIds, personId);
    refresh();
    return { updated };
  });
}

export async function assignPhaseDefaultOwner(phase: PhaseName, personId: string | null): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await setPhaseDefaultOwner(phase, personId);
    refresh();
    return {};
  });
}

export async function fillDefaultPhaseOwners(): Promise<ActionResult<{ assigned: number }>> {
  await requireActionAuth();
  return run(async () => {
    const assigned = await applyDefaultPhaseOwners();
    refresh();
    return { assigned };
  });
}
