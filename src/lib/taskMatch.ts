import { normalizeSubject, stripSubject } from "@/lib/threads";

// Matching an email to an open task, so an email that settles a matter can update (or resolve) the task it is about.
// A task made from an email remembers that email's link; the proposals with that link tell which email chain the task
// started in (the mail system's conversation id, and the subject). A later email of the same chain is the likely answer.
// This only SUGGESTS the task: a person always confirms it on the Inbox card, and nothing here changes any data.

export type MatchableTask = {
  id: string;
  status: string;
  customerId: string;
  projectId: string | null;
  conversationIds: string[]; // the email chains the task started in (usually one)
  subjects: string[]; // their subjects, without Re:/Fw: and lower-cased (see normalizeSubject)
};

export type EmailRef = {
  conversationId?: string | null;
  sourceSubject?: string | null;
  projectId?: string | null;
  customerId?: string | null;
};

export type TaskMatch = {
  taskId: string | null; // the one task to preselect; null when there is none or it is not clear
  how: "conversation" | "subject" | null;
  candidateIds: string[]; // every task the email could be about (offered first in the picker)
};

// The same subject is only a clue within the same project (or, when one side has no project, the same customer): two
// customers can both write "Initial layout".
function sameScope(email: EmailRef, task: MatchableTask): boolean {
  if (email.projectId && task.projectId) return email.projectId === task.projectId;
  if (email.customerId) return email.customerId === task.customerId;
  return false;
}

// A long chain (a regular project meeting thread, say) can hold tasks of many customers and projects, so the chain alone is not
// enough: an email about one project is only offered that project's tasks (and the same customer's general ones), an email about
// a customer only that customer's. With neither known, the chain decides.
function chainScopeAllows(email: EmailRef, task: MatchableTask): boolean {
  if (email.projectId) return task.projectId === email.projectId || (task.projectId === null && Boolean(email.customerId) && email.customerId === task.customerId);
  if (email.customerId) return email.customerId === task.customerId;
  return true;
}

// 1) the same email chain (conversation id), 2) the same subject in the same project or customer. A level with exactly one
// open task decides; a level with several leaves the choice to the reviewer (all are candidates). Resolved tasks never match.
export function matchTasksToEmail(email: EmailRef, tasks: MatchableTask[]): TaskMatch {
  const open = tasks.filter((t) => t.status !== "RESOLVED");
  const conversation = email.conversationId ? open.filter((t) => t.conversationIds.includes(email.conversationId as string) && chainScopeAllows(email, t)) : [];
  if (conversation.length === 1) return { taskId: conversation[0].id, how: "conversation", candidateIds: [conversation[0].id] };
  if (conversation.length > 1) return { taskId: null, how: "conversation", candidateIds: conversation.map((t) => t.id) };

  const subject = normalizeSubject(email.sourceSubject);
  const bySubject = subject ? open.filter((t) => t.subjects.includes(subject) && sameScope(email, t)) : [];
  if (bySubject.length === 1) return { taskId: bySubject[0].id, how: "subject", candidateIds: [bySubject[0].id] };
  return { taskId: null, how: bySubject.length > 1 ? "subject" : null, candidateIds: bySubject.map((t) => t.id) };
}

// What a TASK_UPDATE can do to the task.
export const TASK_OUTCOMES = [
  { value: "RESOLVED", label: "Resolved: the matter is settled" },
  { value: "WAITING_CUSTOMER", label: "Waiting on customer" },
  { value: "WAITING_US", label: "Waiting on us" },
  { value: "LOG", label: "Just add it to the log" },
] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number]["value"];
export const isTaskOutcome = (v: unknown): v is TaskOutcome => TASK_OUTCOMES.some((o) => o.value === v);

// The task status an outcome sets (null = leave the status as it is).
export const outcomeStatus = (o: TaskOutcome): string | null => (o === "LOG" ? null : o);

// Builds the thread information of tasks from the proposals that carry the same email link as the task.
export type LinkThread = { conversationIds: string[]; subjects: string[]; display: string | null };
export function threadsByLink(rows: { sourceLink: string | null; conversationId: string | null; sourceSubject: string | null }[]): Map<string, LinkThread> {
  const map = new Map<string, LinkThread>();
  for (const r of rows) {
    if (!r.sourceLink) continue;
    const entry = map.get(r.sourceLink) ?? { conversationIds: [], subjects: [], display: null };
    if (r.conversationId && !entry.conversationIds.includes(r.conversationId)) entry.conversationIds.push(r.conversationId);
    const subject = normalizeSubject(r.sourceSubject);
    if (subject && !entry.subjects.includes(subject)) entry.subjects.push(subject);
    entry.display ??= stripSubject(r.sourceSubject) || null;
    map.set(r.sourceLink, entry);
  }
  return map;
}
