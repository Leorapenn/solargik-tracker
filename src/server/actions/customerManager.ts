"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { cleanCustomerManager, type CustomerManagerInput } from "@/lib/contacts";
import { run, UserError, type ActionResult } from "@/lib/errors";

// Sets (or, with everything empty, clears) the project manager on the customer's side.
export async function saveCustomerManager(projectId: string, input: CustomerManagerInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const cleaned = cleanCustomerManager(input);
    if (!cleaned.ok) throw new UserError(cleaned.error);
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) throw new UserError("That project no longer exists.");
    await prisma.project.update({
      where: { id: projectId },
      data: { customerManagerName: cleaned.value.name, customerManagerEmail: cleaned.value.email, customerManagerPhone: cleaned.value.phone },
    });
    revalidatePath("/projects", "layout");
    return {};
  });
}
