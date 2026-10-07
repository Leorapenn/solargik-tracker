"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import { approveSuggestion, rejectSuggestion } from "@/server/services/suggestions";

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/projects", "layout");
  revalidatePath("/phases");
  revalidatePath("/payments", "layout");
  revalidatePath("/updates");
  revalidatePath("/customers", "layout");
}

// Approving is the only way a suggestion changes real data. `overrides` = the project picked and the reworded text.
export async function approve(id: string, overrides: { projectId?: string | null; text?: string } = {}): Promise<ActionResult<{ note: string }>> {
  await requireActionAuth();
  return run(async () => {
    const note = await approveSuggestion(id, overrides);
    refresh();
    return { note };
  });
}

export async function reject(id: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await rejectSuggestion(id);
    refresh();
    return {};
  });
}
