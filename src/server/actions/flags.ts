"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import { addFlag as add, removeFlag as remove, type FlagTarget } from "@/server/services/flags";

function refresh(kind: FlagTarget) {
  revalidatePath("/customers", "layout");
  revalidatePath("/projects", "layout");
  if (kind === "project") revalidatePath("/phases");
}

const valid = (kind: unknown): kind is FlagTarget => kind === "customer" || kind === "project";

export async function addFlag(kind: FlagTarget, id: string, label: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    if (!valid(kind)) throw new Error("bad kind");
    await add(kind, id, label);
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
