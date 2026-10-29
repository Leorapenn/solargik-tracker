import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/dates";
import { threadsByLink, type MatchableTask } from "@/lib/taskMatch";
import type { OpenTaskSource } from "@/lib/intakeDirectory";

// The open tasks with the email chain each one started in. A task made from an email keeps that email's link; the
// proposals that carry the same link know the conversation id and subject. No schema needed: the link is the join.

export type OpenTaskChoice = MatchableTask & { topic: string; customerName: string; projectName: string | null; ownerName: string | null; thread: string | null };

async function loadOpenTasks(): Promise<(OpenTaskChoice & OpenTaskSource)[]> {
  const rows = await prisma.task.findMany({
    where: { NOT: { status: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      topic: true,
      status: true,
      customerId: true,
      projectId: true,
      sourceLink: true,
      lastContactAt: true,
      customer: { select: { name: true } },
      project: { select: { name: true } },
      owner: { select: { name: true } },
    },
  });
  const links = [...new Set(rows.map((r) => r.sourceLink).filter((l): l is string => Boolean(l)))];
  const proposals = links.length ? await prisma.suggestion.findMany({ where: { sourceLink: { in: links } }, select: { sourceLink: true, conversationId: true, sourceSubject: true } }) : [];
  const threads = threadsByLink(proposals);
  return rows.map((r) => {
    const t = (r.sourceLink ? threads.get(r.sourceLink) : undefined) ?? { conversationIds: [], subjects: [], display: null };
    return {
      id: r.id,
      topic: r.topic,
      status: r.status,
      customerId: r.customerId,
      projectId: r.projectId,
      customerName: r.customer.name,
      projectName: r.project?.name ?? null,
      ownerName: r.owner?.name ?? null,
      lastContactAt: r.lastContactAt ? toDateInputValue(r.lastContactAt) : null,
      conversationIds: t.conversationIds,
      subjects: t.subjects,
      subjectText: t.display,
      thread: t.display,
    };
  });
}

// For the Inbox cards: every open task with what is needed to match it to an email and to show it in a picker.
export async function listOpenTasksForCards(): Promise<OpenTaskChoice[]> {
  return (await loadOpenTasks()).map((t) => ({ id: t.id, status: t.status, customerId: t.customerId, projectId: t.projectId, conversationIds: t.conversationIds, subjects: t.subjects, topic: t.topic, customerName: t.customerName, projectName: t.projectName, ownerName: t.ownerName, thread: t.thread }));
}

// For the email agent's directory: open tasks grouped by project, and (with no project) by customer.
export async function openTasksByOwner(): Promise<{ byProject: Map<string, OpenTaskSource[]>; byCustomer: Map<string, OpenTaskSource[]> }> {
  const byProject = new Map<string, OpenTaskSource[]>();
  const byCustomer = new Map<string, OpenTaskSource[]>();
  for (const t of await loadOpenTasks()) {
    const source: OpenTaskSource = { id: t.id, topic: t.topic, status: t.status, ownerName: t.ownerName, lastContactAt: t.lastContactAt, subjects: t.subjects, conversationIds: t.conversationIds, subjectText: t.subjectText };
    const [map, key] = t.projectId ? ([byProject, t.projectId] as const) : ([byCustomer, t.customerId] as const);
    map.set(key, [...(map.get(key) ?? []), source]);
  }
  return { byProject, byCustomer };
}
