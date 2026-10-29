import { prisma } from "@/lib/prisma";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { threadsByLink, type MatchableTask } from "@/lib/taskMatch";
import type { TimelineEmail } from "@/lib/taskTimeline";
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

// The emails of each task's chain, for its history: the email the task was created from, and every other email of the same
// conversation that produced a proposal (any status). Only the subject, the day and the link of each, never its text. Each
// email appears once (by message id or link). A task made from an email whose proposal is not on file still gets that
// email, by the task's own link. A task typed by hand has no chain.
export async function loadTaskEmails(tasks: { id: string; sourceLink: string | null; createdOn: string }[]): Promise<Map<string, TimelineEmail[]>> {
  const out = new Map<string, TimelineEmail[]>();
  const links = [...new Set(tasks.map((t) => t.sourceLink).filter((l): l is string => Boolean(l)))];
  if (links.length === 0) return out;

  const origin = await prisma.suggestion.findMany({ where: { sourceLink: { in: links } }, select: { sourceLink: true, conversationId: true } });
  const chainsByLink = new Map<string, Set<string>>();
  for (const o of origin) {
    if (!o.sourceLink || !o.conversationId) continue;
    chainsByLink.set(o.sourceLink, (chainsByLink.get(o.sourceLink) ?? new Set()).add(o.conversationId));
  }
  const chains = [...new Set([...chainsByLink.values()].flatMap((s) => [...s]))];
  const rows = await prisma.suggestion.findMany({
    where: { OR: [{ sourceLink: { in: links } }, ...(chains.length ? [{ conversationId: { in: chains } }] : [])] },
    orderBy: { createdAt: "asc" },
    take: 3000,
    select: { sourceLink: true, conversationId: true, sourceSubject: true, sourceReceivedAt: true, sourceMessageId: true, createdAt: true },
  });

  for (const t of tasks) {
    if (!t.sourceLink) continue;
    const mine = chainsByLink.get(t.sourceLink) ?? new Set<string>();
    const seen = new Set<string>();
    const emails: TimelineEmail[] = [];
    for (const r of rows) {
      if (!(r.sourceLink === t.sourceLink || (r.conversationId && mine.has(r.conversationId)))) continue;
      const key = r.sourceMessageId ?? r.sourceLink ?? `${r.sourceSubject ?? ""}|${r.createdAt.toISOString()}`;
      if (seen.has(key) || (r.sourceLink && seen.has(r.sourceLink))) continue;
      seen.add(key);
      if (r.sourceLink) seen.add(r.sourceLink);
      emails.push({ key, day: toDateInputValue(todayInAppTz(r.sourceReceivedAt ?? r.createdAt)), subject: (r.sourceSubject ?? "").replace(/\s+/g, " ").trim() || "(no subject)", link: r.sourceLink });
    }
    if (!seen.has(t.sourceLink)) emails.push({ key: "origin", day: t.createdOn, subject: "The email the task was created from", link: t.sourceLink });
    out.set(t.id, emails);
  }
  return out;
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
