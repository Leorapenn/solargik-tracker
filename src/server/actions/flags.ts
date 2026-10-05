"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import type { FlagColor } from "@/lib/flags";
import { addFlag as add, removeFlag as remove, setFlagColor as recolor, type FlagTarget } from "@/server/services/flags";

function refresh(kind: FlagTarget) {
  revalidatePath("/customers", "layout");
  revalidatePath("/projects", "layout");
  if (kind === "project") revalidatePath("/phases");
}

const valid = (kind: unknown): kind is FlagTarget => kind === "customer" || kind === "project";

// color only applies to customer flags (green / yellow / red); it is ignored for projects.
export async function addFlag(kind: FlagTarget, id: string, label: string, color?: FlagColor): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    if (!valid(kind)) throw new Error("bad kind");
    await add(kind, id, label, color);
    refresh(kind);
    return {};
  });
}

export async function removeFlag(kind: FlagTarget, id: string, label: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    if (!valid(kind)) throw new Error("bad kind");
    await remove(kind, id, label);
    refresh(kind);
    return {};
  });
}

export async function setCustomerFlagColor(customerId: string, label: string, color: FlagColor): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await recolor(customerId, label, color);
    refresh("customer");
    return {};
  });
}
