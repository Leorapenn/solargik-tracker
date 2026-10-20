"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import { CHANGE_ORDER_EDIT_KEYS, approveSuggestion, approveSuggestionAsTask, rejectSuggestion, type CardEdits } from "@/server/services/suggestions";
import type { TaskInput } from "@/lib/tasks";
import { NEW_PROJECT_EDIT_KEYS, NEW_PROJECT_PROFILE_KEYS } from "@/lib/newProject";

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/projects", "layout");
  revalidatePath("/phases");
  revalidatePath("/payments", "layout");
  revalidatePath("/updates");
  revalidatePath("/customers", "layout");
}

// Approving is the only way a suggestion changes real data. `overrides` = the project picked and the reworded text.
export async function approve(id: string, overrides: { projectId?: string | null; customerId?: string | null; text?: string; fields?: CardEdits } = {}): Promise<ActionResult<{ note: string }>> {
  await requireActionAuth();
  return run(async () => {
    // only the known text fields of a change order or a new project can be corrected, and only as text
    const fields: CardEdits = {};
    if (overrides.fields && typeof overrides.fields === "object") {
      for (const key of [...CHANGE_ORDER_EDIT_KEYS, ...NEW_PROJECT_EDIT_KEYS, ...NEW_PROJECT_PROFILE_KEYS]) {
        const v = (overrides.fields as Record<string, unknown>)[key];
        if (typeof v === "string") fields[key] = v.slice(0, 4200);
      }
    }
    const customerId = typeof overrides.customerId === "string" ? overrides.customerId : overrides.customerId === null ? null : undefined;
    const note = await approveSuggestion(id, { projectId: overrides.projectId, customerId, text: overrides.text, ...(overrides.fields ? { fields } : {}) });
    refresh();
    return { note };
  });
}

// Confirming the task form of an action item: creates the task from the edited form and approves the proposal.
export async function approveAsTask(id: string, input: TaskInput): Promise<ActionResult<{ note: string }>> {
  await requireActionAuth();
  return run(async () => {
    const note = await approveSuggestionAsTask(id, input);
    refresh();
    revalidatePath("/tasks");
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
