"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import type { ChangeOrderInput, MilestoneInput } from "@/lib/payments";
import { savePayments as save } from "@/server/services/payments";

export async function savePayments(projectId: string, input: { milestones: MilestoneInput[]; changeOrders: ChangeOrderInput[] }): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await save(projectId, input);
    revalidatePath("/payments", "layout");
    revalidatePath(`/projects/${projectId}`);
    return {};
  });
}
