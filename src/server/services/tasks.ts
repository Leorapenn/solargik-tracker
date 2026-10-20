import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { cleanTask, cleanTaskUpdate, compareTasks, isTaskStatus, taskAttention, taskStatusChoice, type Attention, type CleanTask, type TaskInput } from "@/lib/tasks";

const iso = (d: Date | null) => (d ? toDateInputValue(d) : null);
const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const todayIso = () => toDateInputValue(todayInAppTz());

export type TaskUpdateView = { id: string; date: string; text: string };
export type TaskView = {
  id: string;
  customerId: string;
  customerName: string;
  projectId: string | null;
  projectName: string | null;
  topic: string;
  details: string | null;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  lastContactAt: string | null;
  lastContactNote: string | null;
  nextFollowUp: string | null;
  resolvedAt: string | null;
  sourceLink: string | null; // the email it was created from
  createdOn: string;
  updates: TaskUpdateView[]; // newest first
};

const include = {
  customer: { select: { name: true } },
  project: { select: { name: true } },
  owner: { select: { name: true } },
  updates: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
};

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
    ownerId: t.ownerId,
    ownerName: t.owner?.name ?? null,
    lastContactAt: iso(t.lastContactAt),
    lastContactNote: t.lastContactNote,
    nextFollowUp: iso(t.nextFollowUp),
    resolvedAt: iso(t.resolvedAt),
    sourceLink: t.sourceLink,
    createdOn: toDateInputValue(t.createdAt),
    updates: t.updates.map((u) => ({ id: u.id, date: toDateInputValue(u.date), text: u.text })),
  };
}

export async function listTasks(): Promise<TaskView[]> {
  const rows = await prisma.task.findMany({ include });
  const today = todayIso();
  return rows.map(toView).sort((a, b) => compareTasks(a, b, today) || a.customerName.localeCompare(b.customerName) || a.topic.localeCompare(b.topic));
}

// The customer's open tasks (for the customer page), most urgent first.
export async function listOpenTasksForCustomer(customerId: string): Promise<TaskView[]> {
  const rows = await prisma.task.findMany({ where: { customerId, NOT: { status: "RESOLVED" } }, include });
  const today = todayIso();
  return rows.map(toView).sort((a, b) => compareTasks(a, b, today));
}

// The open tasks tied to one project (for the project page), most urgent first. Tasks about the customer in general are not included.
export async function listOpenTasksForProject(projectId: string): Promise<TaskView[]> {
  if (!projectId) return [];
  const rows = await prisma.task.findMany({ where: { projectId, NOT: { status: "RESOLVED" } }, include });
  const today = todayIso();
  return rows.map(toView).sort((a, b) => compareTasks(a, b, today));
}

// Everything that needs attention now (for the bell): overdue, due today, or quiet. Most urgent first.
export type TaskReminder = { id: string; customerId: string; customerName: string; projectName: string | null; topic: string; status: string; attention: Attention };
export async function listReminders(): Promise<TaskReminder[]> {
  const today = todayIso();
  const rows = await prisma.task.findMany({ where: { NOT: { status: "RESOLVED" } }, include: { customer: { select: { name: true } }, project: { select: { name: true } } } });
  const found: { reminder: TaskReminder; times: { status: string; nextFollowUp: string | null; lastContactAt: string | null; createdOn: string } }[] = [];
  for (const r of rows) {
    const times = { status: r.status, nextFollowUp: iso(r.nextFollowUp), lastContactAt: iso(r.lastContactAt), createdOn: toDateInputValue(r.createdAt) };
    const attention = taskAttention(times, today);
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
      ownerId: v.ownerId,
      lastContactAt: day(v.lastContactAt),
      lastContactNote: v.lastContactNote,
      nextFollowUp: day(v.nextFollowUp),
      resolvedAt: v.status === "RESOLVED" ? day(today) : null,
      sourceLink: v.sourceLink,
      updates: { create: [{ date: day(today)!, text: "Task created" }] },
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
      const before = await tx.task.findUnique({ where: { id }, select: { status: true, resolvedAt: true } });
      if (!before) throw new UserError("That task no longer exists.");
      const resolving = v.status === "RESOLVED" && before.status !== "RESOLVED";
      await tx.task.update({
        where: { id },
        data: {
          customerId: v.customerId,
          projectId: v.projectId,
          topic: v.topic,
          details: v.details,
          status: v.status,
          ownerId: v.ownerId,
          lastContactAt: day(v.lastContactAt),
          lastContactNote: v.lastContactNote,
          // a resolved task has nothing left to chase
          nextFollowUp: v.status === "RESOLVED" ? null : day(v.nextFollowUp),
          resolvedAt: v.status === "RESOLVED" ? (resolving ? day(today) : before.resolvedAt) : null,
          sourceLink: v.sourceLink,
        },
      });
      if (v.status !== before.status) await tx.taskUpdate.create({ data: { taskId: id, date: day(today)!, text: statusLine(v.status) } });
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
export async function addTaskUpdate(id: string, input: { date?: unknown; text?: unknown; contact?: boolean; nextFollowUp?: unknown }): Promise<void> {
  const today = todayIso();
  const cleaned = cleanTaskUpdate(input, today);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const { date, text } = cleaned.value;
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
      await tx.taskUpdate.create({ data: { taskId: id, date: day(date)!, text } });
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
