import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { cleanTask, cleanTaskUpdate, compareTasks, isTaskPriority, isTaskStatus, taskAttention, taskPriorityChoice, taskStatusChoice, type Attention, type CleanTask, type TaskInput } from "@/lib/tasks";
import { cleanWebLink } from "@/lib/links";
import { deadlineLocal, deadlineStatus, formatDeadline, parseDeadlineLocal, type DeadlineLevel } from "@/lib/deadline";
import type { TimelineEmail } from "@/lib/taskTimeline";
import { loadTaskEmails } from "@/server/services/taskMatch";

const iso = (d: Date | null) => (d ? toDateInputValue(d) : null);
const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const todayIso = () => toDateInputValue(todayInAppTz());

export type DeadlineView = { iso: string; local: string; label: string; remaining: string | null; level: DeadlineLevel | null };

export type TaskUpdateView = { id: string; date: string; text: string; sourceLink: string | null; sourceSubject: string | null };
export type TaskView = {
  id: string;
  customerId: string;
  customerName: string;
  projectId: string | null;
  projectName: string | null;
  topic: string;
  details: string | null;
  status: string;
  priority: string; // HIGH | MEDIUM | LOW
  ownerId: string | null;
  ownerName: string | null;
  lastContactAt: string | null;
  lastContactNote: string | null;
  nextFollowUp: string | null;
  resolvedAt: string | null;
  // the deadline (day and time, Israel time), worked out when the page is built: the instant, the form value, how it reads,
  // and the days and hours left (none once the task is resolved)
  deadline: DeadlineView | null;
  deadlineAt: string | null; // the same instant, for sorting
  sourceLink: string | null; // the email it was created from
  createdOn: string;
  updates: TaskUpdateView[]; // newest first
  emails: TimelineEmail[]; // the emails of the chain the task started in (subject, day and link only)
};

const include = {
  customer: { select: { name: true } },
  project: { select: { name: true } },
  owner: { select: { name: true } },
  updates: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
};

function toDeadlineView(deadline: Date | null, resolved: boolean, now: Date = new Date()): DeadlineView | null {
  if (!deadline) return null;
  const status = resolved ? null : deadlineStatus(deadline, now);
  return { iso: deadline.toISOString(), local: deadlineLocal(deadline), label: formatDeadline(deadline), remaining: status?.text ?? null, level: status?.level ?? null };
}

type Row = Awaited<ReturnType<typeof prisma.task.findMany<{ include: typeof include }>>>[number];

function toView(t: Row): TaskView {
  return {
    id: t.id,
    customerId: t.customerId,
    customerName: t.customer.name,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
    topic: t.topic,
    details: t.details,
    status: t.status,
    priority: t.priority,
    ownerId: t.ownerId,
    ownerName: t.owner?.name ?? null,
    lastContactAt: iso(t.lastContactAt),
    lastContactNote: t.lastContactNote,
    nextFollowUp: iso(t.nextFollowUp),
    resolvedAt: iso(t.resolvedAt),
    deadline: toDeadlineView(t.deadline, t.status === "RESOLVED"),
    deadlineAt: t.deadline ? t.deadline.toISOString() : null,
    sourceLink: t.sourceLink,
    createdOn: toDateInputValue(t.createdAt),
    updates: t.updates.map((u) => ({ id: u.id, date: toDateInputValue(u.date), text: u.text, sourceLink: u.sourceLink, sourceSubject: u.sourceSubject })),
    emails: [],
  };
}

// The views of some tasks, each with the emails of its chain (for the history). The email lookup never breaks a page: if it
// fails the tasks are shown without the emails.
async function toViews(rows: Row[]): Promise<TaskView[]> {
  const views = rows.map(toView);
  try {
    const emails = await loadTaskEmails(views.map((v) => ({ id: v.id, sourceLink: v.sourceLink, createdOn: v.createdOn })));
    for (const v of views) v.emails = emails.get(v.id) ?? [];
  } catch {
    /* the history then shows the log only */
  }
  return views;
}

export async function listTasks(): Promise<TaskView[]> {
  const rows = await prisma.task.findMany({ include });
  const today = todayIso();
  return (await toViews(rows)).sort((a, b) => compareTasks(a, b, today) || a.customerName.localeCompare(b.customerName) || a.topic.localeCompare(b.topic));
}

// The customer's open tasks (for the customer page), most urgent first.
export async function listOpenTasksForCustomer(customerId: string): Promise<TaskView[]> {
  const rows = await prisma.task.findMany({ where: { customerId, NOT: { status: "RESOLVED" } }, include });
  const today = todayIso();
  return (await toViews(rows)).sort((a, b) => compareTasks(a, b, today));
}

// The open tasks tied to one project (for the project page), most urgent first. Tasks about the customer in general are not included.
export async function listOpenTasksForProject(projectId: string): Promise<TaskView[]> {
  if (!projectId) return [];
  const rows = await prisma.task.findMany({ where: { projectId, NOT: { status: "RESOLVED" } }, include });
  const today = todayIso();
  return (await toViews(rows)).sort((a, b) => compareTasks(a, b, today));
}

// The reminder a deadline gives: overdue (it has passed) or today (still ahead, but today). Later ones give none.
export function deadlineAttention(deadline: Date, now: Date): Attention | null {
  const s = deadlineStatus(deadline, now);
  if (s.level === "overdue") return { level: "overdue", days: s.days, text: `Deadline passed: ${s.text.toLowerCase()}` };
  if (s.level === "today") return { level: "today", days: 0, text: `Deadline today at ${deadlineLocal(deadline).slice(11)}: ${s.text}` };
  return null;
}

// Everything that needs attention now (for the bell): overdue, due today, or quiet. Most urgent first.
export type TaskReminder = { id: string; customerId: string; customerName: string; projectName: string | null; topic: string; status: string; attention: Attention };
export async function listReminders(): Promise<TaskReminder[]> {
  const today = todayIso();
  const rows = await prisma.task.findMany({ where: { NOT: { status: "RESOLVED" } }, include: { customer: { select: { name: true } }, project: { select: { name: true } } } });
  const found: { reminder: TaskReminder; times: { status: string; nextFollowUp: string | null; lastContactAt: string | null; createdOn: string } }[] = [];
  const now = new Date();
  const rank = { overdue: 0, today: 1, quiet: 2 } as const;
  for (const r of rows) {
    const times = { status: r.status, nextFollowUp: iso(r.nextFollowUp), lastContactAt: iso(r.lastContactAt), createdOn: toDateInputValue(r.createdAt) };
    let attention = taskAttention(times, today);
    // a deadline that has passed, or is today, is a reminder too (the more urgent of the two is shown; a tie goes to the deadline)
    const byDeadline = r.deadline ? deadlineAttention(r.deadline, now) : null;
    if (byDeadline && (!attention || rank[byDeadline.level] <= rank[attention.level])) attention = byDeadline;
    if (attention) found.push({ reminder: { id: r.id, customerId: r.customerId, customerName: r.customer.name, projectName: r.project?.name ?? null, topic: r.topic, status: r.status, attention }, times });
  }
  return found.sort((a, b) => compareTasks(a.times, b.times, today)).map((x) => x.reminder);
}

// The customer must exist, the project must be one of that customer's, the owner must be an active person.
async function check(v: CleanTask) {
  const customer = await prisma.customer.findUnique({ where: { id: v.customerId }, select: { id: true } });
  if (!customer) throw new UserError("That customer no longer exists.");
  if (v.projectId) {
    const project = await prisma.project.findUnique({ where: { id: v.projectId }, select: { customerId: true } });
    if (!project || project.customerId !== v.customerId) throw new UserError("That project doesn't belong to this customer.");
  }
  if (v.ownerId) {
    const owner = await prisma.person.findUnique({ where: { id: v.ownerId }, select: { active: true } });
    if (!owner || !owner.active) throw new UserError("That owner doesn't exist or is no longer active.");
  }
}

const statusLine = (status: string) => `Status changed to ${taskStatusChoice(status).label}`;
const priorityLine = (priority: string) => `Priority changed to ${taskPriorityChoice(priority).label}`;

export async function createTask(input: Partial<Record<keyof TaskInput, unknown>>): Promise<string> {
  const cleaned = cleanTask(input);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const v = cleaned.value;
  await check(v);
  const today = todayIso();
  const created = await prisma.task.create({
    data: {
      customerId: v.customerId,
      projectId: v.projectId,
      topic: v.topic,
      details: v.details,
      status: v.status,
      priority: v.priority,
      ownerId: v.ownerId,
      lastContactAt: day(v.lastContactAt),
      lastContactNote: v.lastContactNote,
      nextFollowUp: day(v.nextFollowUp),
      deadline: v.deadline ? parseDeadlineLocal(v.deadline) : null,
      resolvedAt: v.status === "RESOLVED" ? day(today) : null,
      sourceLink: v.sourceLink,
      // a task made from an email: its first entry points at that email
      updates: { create: [{ date: day(today)!, text: "Task created", sourceLink: v.sourceLink }] },
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateTask(id: string, input: Partial<Record<keyof TaskInput, unknown>>): Promise<void> {
  const cleaned = cleanTask(input);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const v = cleaned.value;
  await check(v);
  const today = todayIso();
  await prisma.$transaction(
    async (tx) => {
      const before = await tx.task.findUnique({ where: { id }, select: { status: true, priority: true, resolvedAt: true, deadline: true } });
      if (!before) throw new UserError("That task no longer exists.");
      const resolving = v.status === "RESOLVED" && before.status !== "RESOLVED";
      const newDeadline = v.deadline ? parseDeadlineLocal(v.deadline) : null;
      await tx.task.update({
        where: { id },
        data: {
          customerId: v.customerId,
          projectId: v.projectId,
          topic: v.topic,
          details: v.details,
          status: v.status,
          priority: v.priority,
          ownerId: v.ownerId,
          lastContactAt: day(v.lastContactAt),
          lastContactNote: v.lastContactNote,
          // a resolved task has nothing left to chase
          nextFollowUp: v.status === "RESOLVED" ? null : day(v.nextFollowUp),
          deadline: newDeadline,
          resolvedAt: v.status === "RESOLVED" ? (resolving ? day(today) : before.resolvedAt) : null,
          sourceLink: v.sourceLink,
        },
      });
      if ((newDeadline?.getTime() ?? null) !== (before.deadline?.getTime() ?? null)) {
        const text = !newDeadline ? "Deadline removed" : before.deadline ? `Deadline changed to ${formatDeadline(newDeadline)}` : `Deadline set to ${formatDeadline(newDeadline)}`;
        await tx.taskUpdate.create({ data: { taskId: id, date: day(today)!, text } });
      }
      if (v.status !== before.status) await tx.taskUpdate.create({ data: { taskId: id, date: day(today)!, text: statusLine(v.status) } });
      if (v.priority !== before.priority) await tx.taskUpdate.create({ data: { taskId: id, date: day(today)!, text: priorityLine(v.priority) } });
    },
    { timeout: 20000 },
  );
}

// Changes only the priority (the dropdown on a task), with a line in the log.
export async function setTaskPriority(id: string, priority: string): Promise<void> {
  if (!isTaskPriority(priority)) throw new UserError("That priority doesn't exist.");
  const today = todayIso();
  await prisma.$transaction(
    async (tx) => {
      const before = await tx.task.findUnique({ where: { id }, select: { priority: true } });
      if (!before) throw new UserError("That task no longer exists.");
      if (before.priority === priority) return;
      await tx.task.update({ where: { id }, data: { priority } });
      await tx.taskUpdate.create({ data: { taskId: id, date: day(today)!, text: priorityLine(priority) } });
    },
    { timeout: 20000 },
  );
}

export async function setTaskStatus(id: string, status: string): Promise<void> {
  if (!isTaskStatus(status)) throw new UserError("That status doesn't exist.");
  const today = todayIso();
  await prisma.$transaction(
    async (tx) => {
      const before = await tx.task.findUnique({ where: { id }, select: { status: true, resolvedAt: true } });
      if (!before) throw new UserError("That task no longer exists.");
      if (before.status === status) return;
      await tx.task.update({
        where: { id },
        data: { status, resolvedAt: status === "RESOLVED" ? day(today) : null, ...(status === "RESOLVED" ? { nextFollowUp: null } : {}) },
      });
      await tx.taskUpdate.create({ data: { taskId: id, date: day(today)!, text: statusLine(status) } });
    },
    { timeout: 20000 },
  );
}

// Marks every open task of ONE customer as resolved (each gets its log line and loses its follow-up date, exactly as
// resolving it by hand). Returns how many were closed. An empty or unknown customer closes nothing: the filter is never
// built from an undefined value, so it can't reach every customer's tasks.
export async function closeCustomerTasks(customerId: string): Promise<number> {
  if (typeof customerId !== "string" || !customerId.trim()) throw new UserError("Choose a customer.");
  const open = await prisma.task.findMany({ where: { customerId, NOT: { status: "RESOLVED" } }, select: { id: true } });
  for (const t of open) await setTaskStatus(t.id, "RESOLVED");
  return open.length;
}

// Adds a dated entry to the log. When it is a correspondence with the customer (the default) it also becomes the
// "last correspondence" (only if it is newer than the one recorded), and a new follow-up date can be set with it.
export async function addTaskUpdate(id: string, input: { date?: unknown; text?: unknown; contact?: boolean; nextFollowUp?: unknown; sourceLink?: unknown; sourceSubject?: unknown }): Promise<void> {
  const today = todayIso();
  const cleaned = cleanTaskUpdate(input, today);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const { date, text } = cleaned.value;
  // an entry that comes from an email keeps only its link and subject
  const link = cleanWebLink(typeof input.sourceLink === "string" ? input.sourceLink : "");
  if (!link.ok) throw new UserError(`The email link: ${link.error}`);
  const sourceSubject = typeof input.sourceSubject === "string" ? input.sourceSubject.replace(/\s+/g, " ").trim().slice(0, 300) || null : null;
  let nextFollowUp: string | null | undefined;
  if (input.nextFollowUp !== undefined && input.nextFollowUp !== "") {
    const probe = cleanTask({ customerId: "x", topic: "x", nextFollowUp: input.nextFollowUp });
    if (!probe.ok) throw new UserError(probe.error);
    nextFollowUp = probe.value.nextFollowUp;
  }
  await prisma.$transaction(
    async (tx) => {
      const task = await tx.task.findUnique({ where: { id }, select: { lastContactAt: true, status: true } });
      if (!task) throw new UserError("That task no longer exists.");
      await tx.taskUpdate.create({ data: { taskId: id, date: day(date)!, text, sourceLink: link.value, sourceSubject: link.value ? sourceSubject : null } });
      const data: Record<string, unknown> = {};
      if (input.contact !== false && (!task.lastContactAt || iso(task.lastContactAt)! <= date)) {
        data.lastContactAt = day(date);
        data.lastContactNote = text.replace(/\s+/g, " ").slice(0, 300);
      }
      if (nextFollowUp && task.status !== "RESOLVED") data.nextFollowUp = day(nextFollowUp);
      if (Object.keys(data).length > 0) await tx.task.update({ where: { id }, data });
    },
    { timeout: 20000 },
  );
}

// One click: contacted the customer today (also a log entry, so the history stays honest).
export async function markContactedToday(id: string): Promise<void> {
  await addTaskUpdate(id, { text: "Contacted the customer", contact: true });
}

export async function deleteTask(id: string): Promise<void> {
  const found = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw new UserError("That task no longer exists.");
  await prisma.task.delete({ where: { id } });
}
