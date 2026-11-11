"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, UserError, type ActionResult } from "@/lib/errors";
import { applyDeliveryProposal } from "@/server/services/deliveryProposals";

const KEYS = ["PILES", "TRACKER_STRUCTURE", "DRIVE_UNITS_IC", "SUPPLY_COMPLETION"];

// A manager accepts a suggested Delivery sub-stage ("mark Delivery – Tracker Structure Done on <day>"). Managers only.
export async function acceptDeliveryProposal(projectId: string, key: string): Promise<ActionResult<{ note: string }>> {
  await requireActionAuth();
  return run(async () => {
    if (typeof projectId !== "string" || !projectId || !KEYS.includes(key)) throw new UserError("That suggestion doesn't exist.");
    const note = await applyDeliveryProposal(projectId, key);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    revalidatePath("/phases");
    revalidatePath("/overview");
    revalidatePath("/customers", "layout");
    return { note };
  });
}
