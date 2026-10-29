import { prisma } from "@/lib/prisma";
import { MAX_PENDING_PER_PROJECT, MAX_RECENT_PER_PROJECT, RECENT_DAYS, shapeCustomer, shapeProject, type CustomerView, type ProjectView } from "@/lib/intakeDirectory";
import { openTasksByOwner } from "@/server/services/taskMatch";

// Everything proposed in the last RECENT_DAYS days, newest first, grouped by project and, for proposals with no project, by
// customer. One query for all of them (the relation can't be selected twice with different filters).
async function recentByOwner() {
  const rows = await prisma.suggestion.findMany({
    where: { createdAt: { gte: new Date(Date.now() - RECENT_DAYS * 86_400_000) } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: { status: true, kind: true, summary: true, sourceSubject: true, sourceReceivedAt: true, createdAt: true, projectId: true, customerId: true },
  });
  const byProject = new Map<string, typeof rows>();
  const byCustomer = new Map<string, typeof rows>();
  for (const r of rows) {
    const [map, key] = r.projectId ? ([byProject, r.projectId] as const) : r.customerId ? ([byCustomer, r.customerId] as const) : [null, null];
    if (!map || !key) continue;
    const list = map.get(key) ?? [];
    if (list.length < MAX_RECENT_PER_PROJECT) list.push(r);
    map.set(key, list);
  }
  return { byProject, byCustomer };
}

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
  const { byCustomer } = await recentByOwner();
  const tasks = await openTasksByOwner();
  return rows.map((c) => shapeCustomer({ ...c, recentSuggestions: byCustomer.get(c.id), openTasks: tasks.byCustomer.get(c.id) }));
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
      milestones: { orderBy: { order: "asc" }, select: { label: true, percent: true, order: true, status: true } }, // name, percent and state only: never amounts, dates or links
      shipments: { orderBy: { createdAt: "asc" }, select: { reference: true, status: true, customsStatus: true, containers: true, eta: true } }, // no notes, forwarders or links
    },
  });
  const { byProject } = await recentByOwner();
  const tasks = await openTasksByOwner();
  return rows.map((p) => shapeProject({ ...p, recentSuggestions: byProject.get(p.id), openTasks: tasks.byProject.get(p.id) })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
