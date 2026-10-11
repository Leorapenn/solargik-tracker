import { prisma } from "@/lib/prisma";
import { MAX_PENDING_PER_PROJECT, shapeCustomer, shapeProject, type CustomerView, type ProjectView } from "@/lib/intakeDirectory";

// Read-only lists for the email agent's matching (see src/lib/intakeDirectory.ts for what is and isn't included).
// Only the columns named in `select` are ever loaded.

export async function listCustomersForMatching(): Promise<CustomerView[]> {
  const rows = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      aliases: { select: { alias: true } },
      contacts: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  return rows.map(shapeCustomer);
}

// The names of the items every project has, by phase ("DESIGN": ["Layout Approval", ...]), so a status change can
// name the item exactly. These are the template names only: nothing about any project.
export async function listItemNames(): Promise<Record<string, string[]>> {
  const rows = await prisma.subStageTemplate.findMany({ where: { active: true }, orderBy: [{ phase: "asc" }, { order: "asc" }], select: { phase: true, name: true } });
  const byPhase: Record<string, string[]> = {};
  for (const r of rows) (byPhase[r.phase] ??= []).push(r.name);
  return byPhase;
}

export async function listProjectsForMatching(): Promise<ProjectView[]> {
  const rows = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      lifecycle: true,
      mondayStage: true,
      mondayStatus: true,
      sharepointLink: true, // used only to read the folder's name (an alias); never output
      customer: { select: { id: true, name: true } },
      phases: { select: { name: true, status: true, order: true, statusUpdate: true, statusUpdateAt: true } },
      suggestions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: MAX_PENDING_PER_PROJECT, select: { kind: true, summary: true } },
      changeOrders: { orderBy: { createdAt: "asc" }, select: { reason: true, status: true, invoiceStatus: true } }, // names and state only: never the amounts
    },
  });
  return rows.map(shapeProject).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
