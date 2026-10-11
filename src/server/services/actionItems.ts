import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { shapeCorrespondence } from "@/lib/correspondence";
import type { ActionRow } from "@/lib/actionItems";

const MAX_ROWS = 500;

// Every approved action item, open and done (the page filters). Pending and rejected ones stay in the Inbox.
export async function listActionItems(): Promise<ActionRow[]> {
  const rows = await prisma.suggestion.findMany({
    where: { kind: "ACTION_ITEM", status: "APPROVED" },
    orderBy: { reviewedAt: "desc" },
    take: MAX_ROWS,
    include: { project: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } } },
  });
  const out: ActionRow[] = [];
  for (const r of rows) {
    const item = shapeCorrespondence(r);
    if (!item) continue;
    out.push({ ...item, projectId: r.project?.id ?? null, projectName: r.project?.name ?? null, customerId: r.customer?.id ?? null, customerName: r.customer?.name ?? null });
  }
  return out;
}

// Ticks an approved action item as done, or reopens it.
export async function setActionDone(id: string, done: boolean): Promise<void> {
  const row = await prisma.suggestion.findUnique({ where: { id }, select: { kind: true, status: true } });
  if (!row || row.kind !== "ACTION_ITEM" || row.status !== "APPROVED") throw new UserError("Only an approved action item can be marked done.");
  await prisma.suggestion.update({ where: { id }, data: { doneAt: done ? new Date() : null } });
}
