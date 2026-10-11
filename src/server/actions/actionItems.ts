"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import { setActionDone } from "@/server/services/actionItems";

// Ticks an action item done (or reopens it). The item shows on the Actions tab and on its project or customer page.
export async function markActionDone(id: string, done: boolean): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    if (typeof id !== "string" || id.length === 0 || id.length > 64 || typeof done !== "boolean") throw new Error("Bad request.");
    await setActionDone(id, done);
    revalidatePath("/actions");
    revalidatePath("/projects", "layout");
    revalidatePath("/customers", "layout");
    return {};
  });
}
