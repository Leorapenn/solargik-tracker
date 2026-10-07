"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { cleanWarrantyYears } from "@/lib/warranty";
import { run, UserError, type ActionResult } from "@/lib/errors";

// Sets the warranty periods (in years) for a project whose contract differs from the Framework Agreement's
// 10 and 5. An empty box means "use the contract's default".
export async function saveWarrantyYears(projectId: string, input: { structural: string; drive: string }): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const structural = cleanWarrantyYears(input.structural);
    if (!structural.ok) throw new UserError(`Structural units: ${structural.error}`);
    const drive = cleanWarrantyYears(input.drive);
    if (!drive.ok) throw new UserError(`Drive unit: ${drive.error}`);
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) throw new UserError("That project no longer exists.");
    await prisma.project.update({ where: { id: projectId }, data: { warrantyStructuralYears: structural.value, warrantyDriveYears: drive.value } });
    revalidatePath("/projects", "layout");
    return {};
  });
}
