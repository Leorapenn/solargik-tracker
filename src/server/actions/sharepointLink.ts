"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { cleanWebLink } from "@/lib/links";
import { run, UserError, type ActionResult } from "@/lib/errors";

// Sets (or, with an empty box, clears) the link to the project's SharePoint folder. Link only: nothing is read from SharePoint.
export async function saveSharePointLink(projectId: string, link: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const cleaned = cleanWebLink(link);
    if (!cleaned.ok) throw new UserError(cleaned.error);
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) throw new UserError("That project no longer exists.");
    await prisma.project.update({ where: { id: projectId }, data: { sharepointLink: cleaned.value } });
    revalidatePath("/projects", "layout");
    return {};
  });
}
