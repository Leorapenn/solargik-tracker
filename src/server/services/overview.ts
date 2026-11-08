import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/dates";
import type { OverviewItem } from "@/lib/overview";

// Every item of the ACTIVE projects (not the ones before the notice to proceed, on hold, suspended or cancelled) that counts as
// work: N/A items are left out. Only what the overview shows: names, status, owner's name and the target date. No contract values,
// payments, links or notes, because staff may open the overview too.
export async function getOverviewItems(): Promise<OverviewItem[]> {
  const rows = await prisma.subStage.findMany({
    where: { status: { not: "NOT_APPLICABLE" }, phase: { project: { lifecycle: "ACTIVE" } } },
    select: {
      id: true,
      name: true,
      department: true,
      status: true,
      targetDate: true,
      owner: { select: { name: true } },
      phase: { select: { name: true, project: { select: { id: true, name: true, customer: { select: { name: true } } } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    projectId: r.phase.project.id,
    projectName: r.phase.project.name,
    customerName: r.phase.project.customer.name,
    phase: r.phase.name,
    item: r.name,
    department: r.department,
    status: r.status as OverviewItem["status"],
    ownerName: r.owner?.name ?? null,
    targetDate: r.targetDate ? toDateInputValue(r.targetDate) : null,
  }));
}
