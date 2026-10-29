"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import type { ShipmentInput } from "@/lib/shipments";
import { deleteShipment, saveShipment } from "@/server/services/shipments";

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

// Adds a shipment (id empty) or edits one.
export async function saveProjectShipment(projectId: string, id: string, input: ShipmentInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await saveShipment(projectId, id || null, input);
    refresh(projectId);
    return {};
  });
}

export async function removeProjectShipment(projectId: string, id: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await deleteShipment(projectId, id);
    refresh(projectId);
    return {};
  });
}
