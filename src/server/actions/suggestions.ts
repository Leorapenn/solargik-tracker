"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import { CHANGE_ORDER_EDIT_KEYS, approveSuggestion, rejectSuggestion, type ChangeOrderEdits } from "@/server/services/suggestions";

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/projects", "layout");
  revalidatePath("/phases");
  revalidatePath("/payments", "layout");
  revalidatePath("/updates");
  revalidatePath("/customers", "layout");
}

// Approving is the only way a suggestion changes real data. `overrides` = the project picked and the reworded text.
export async function approve(id: string, overrides: { projectId?: string | null; customerId?: string | null; text?: string; fields?: ChangeOrderEdits } = {}): Promise<ActionResult<{ note: string }>> {
  await requireActionAuth();
  return run(async () => {
    // only the known text fields of a change order can be corrected, and only as text
    const fields: ChangeOrderEdits = {};
    if (overrides.fields && typeof overrides.fields === "object") {
      for (const key of CHANGE_ORDER_EDIT_KEYS) {
        const v = (overrides.fields as Record<string, unknown>)[key];
        if (typeof v === "string") fields[key] = v.slice(0, 600);
      }
    }
    const customerId = typeof overrides.customerId === "string" ? overrides.customerId : overrides.customerId === null ? null : undefined;
    const note = await approveSuggestion(id, { projectId: overrides.projectId, customerId, text: overrides.text, ...(overrides.fields ? { fields } : {}) });
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
