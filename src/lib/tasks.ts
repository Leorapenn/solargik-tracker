import type { Choice } from "@/lib/projectProfile";
import { cleanWebLink } from "@/lib/links";

// Tasks: ongoing matters to chase per customer (and optionally one of its projects), e.g. a customer disputing charges.
// A status, the last correspondence, a follow-up date (the reminder) and a dated log. Typed by hand.

export const TASK_STATUSES: Choice[] = [
  { value: "OPEN", label: "Open", bg: "#DCE8FB", text: "#1D4F9F" },
  { value: "WAITING_CUSTOMER", label: "Waiting on customer", bg: "#FEF0D6", text: "#8A5300" },
  { value: "WAITING_US", label: "Waiting on us", bg: "#FCE0DD", text: "#8C1D18" },
  { value: "CALL_SCHEDULED", label: "Call scheduled", bg: "#E6DEF8", text: "#4B2E99" },
  { value: "RESOLVED", label: "Resolved", bg: "#D8F5E3", text: "#047857" },
];
export const isTaskStatus = (v: unknown): v is string => TASK_STATUSES.some((s) => s.value === v);
export const taskStatusChoice = (v: string): Choice => TASK_STATUSES.find((s) => s.value === v) ?? TASK_STATUSES[0];

export const MAX_TOPIC = 120;
export const MAX_DETAILS = 2000;
export const MAX_CONTACT_NOTE = 300;
export const MAX_UPDATE_TEXT = 1000;

// An open task with no contact for this many days (and no future follow-up date) is flagged as quiet.
export const STALE_DAYS = 7;

const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// "today", "yesterday", "5 days ago"; for a future day "in 3 days".
export function agoText(iso: string, todayIso: string): string {
  const d = daysBetween(iso, todayIso);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d === -1) return "tomorrow";
  return d > 0 ? `${d} days ago` : `in ${-d} days`;
}

// ---- what needs attention (the reminders) ----

export type TaskTimes = {
  status: string;
  nextFollowUp: string | null; // YYYY-MM-DD
  lastContactAt: string | null; // YYYY-MM-DD
  createdOn: string; // YYYY-MM-DD, the day the task was created
};
export type Attention = { level: "overdue" | "today" | "quiet"; days: number; text: string };

// Overdue / due today: the follow-up date has come. Quiet: no follow-up date in the future and no contact for STALE_DAYS
// (counted from the last correspondence, or from the day the task was created). A resolved task never needs attention.
export function taskAttention(t: TaskTimes, todayIso: string): Attention | null {
  if (t.status === "RESOLVED") return null;
  if (t.nextFollowUp) {
    const d = daysBetween(t.nextFollowUp, todayIso);
    if (d > 0) return { level: "overdue", days: d, text: `Follow-up was due ${d === 1 ? "yesterday" : `${d} days ago`}` };
    if (d === 0) return { level: "today", days: 0, text: "Follow-up due today" };
    return null; // a follow-up is scheduled for later
  }
  const since = daysBetween(t.lastContactAt ?? t.createdOn, todayIso);
  if (since >= STALE_DAYS) return { level: "quiet", days: since, text: `No contact for ${since} days` };
  return null;
}

const LEVEL_RANK = { overdue: 0, today: 1, quiet: 2 } as const;

// Most urgent first: overdue (the longest first), due today, quiet (the longest first), then by the next follow-up date,
// then the longest since the last contact; resolved tasks last.
export function compareTasks(a: TaskTimes, b: TaskTimes, todayIso: string): number {
  const resolved = Number(a.status === "RESOLVED") - Number(b.status === "RESOLVED");
  if (resolved !== 0) return resolved;
  const aa = taskAttention(a, todayIso);
  const bb = taskAttention(b, todayIso);
  const ra = aa ? LEVEL_RANK[aa.level] : 3;
  const rb = bb ? LEVEL_RANK[bb.level] : 3;
  if (ra !== rb) return ra - rb;
  if (aa && bb && aa.days !== bb.days) return bb.days - aa.days;
  const fa = a.nextFollowUp ?? "9999-12-31";
  const fb = b.nextFollowUp ?? "9999-12-31";
  if (fa !== fb) return fa < fb ? -1 : 1;
  const ca = a.lastContactAt ?? a.createdOn;
  const cb = b.lastContactAt ?? b.createdOn;
  return ca === cb ? 0 : ca < cb ? -1 : 1;
}

// ---- validation of what the form sends ----

export type TaskInput = {
  customerId: string;
  projectId: string; // "" = none
  topic: string;
  details: string;
  status: string;
  ownerId: string; // "" = none
  lastContactAt: string; // "" = none
  lastContactNote: string;
  nextFollowUp: string; // "" = none
  sourceLink: string; // link to the email the task was created from ("" = none); only the link is kept, never the email
};
export type CleanTask = {
  customerId: string;
  projectId: string | null;
  topic: string;
  details: string | null;
  status: string;
  ownerId: string | null;
  lastContactAt: string | null;
  lastContactNote: string | null;
  nextFollowUp: string | null;
  sourceLink: string | null;
};
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const oneLine = (v: unknown) => str(v).replace(/\s+/g, " ").trim();
const block = (v: unknown) => str(v).replace(/\r\n?/g, "\n").trim();

function date(v: unknown, label: string): Result<string | null> {
  const t = str(v).trim();
  if (!t) return { ok: true, value: null };
  return validDate(t) ? { ok: true, value: t } : { ok: false, error: `${label} isn't a valid date.` };
}

export function cleanTask(input: Partial<Record<keyof TaskInput, unknown>>): Result<CleanTask> {
  const customerId = str(input.customerId).trim();
  if (!customerId) return { ok: false, error: "Choose the customer." };
  const topic = oneLine(input.topic);
  if (!topic) return { ok: false, error: "Write the issue or topic." };
  if (topic.length > MAX_TOPIC) return { ok: false, error: `The topic can be at most ${MAX_TOPIC} characters. Put the rest in the details.` };
  const details = block(input.details);
  if (details.length > MAX_DETAILS) return { ok: false, error: `The details can be at most ${MAX_DETAILS} characters.` };
  const status = str(input.status) || "OPEN";
  if (!isTaskStatus(status)) return { ok: false, error: "That status doesn't exist." };
  const note = oneLine(input.lastContactNote);
  if (note.length > MAX_CONTACT_NOTE) return { ok: false, error: `The note about the last correspondence can be at most ${MAX_CONTACT_NOTE} characters.` };
  const last = date(input.lastContactAt, "The last correspondence date");
  if (!last.ok) return last;
  const next = date(input.nextFollowUp, "The follow-up date");
  if (!next.ok) return next;
  const source = cleanWebLink(str(input.sourceLink));
  if (!source.ok) return { ok: false, error: `The email link: ${source.error}` };
  return {
    ok: true,
    value: {
      customerId,
      projectId: str(input.projectId).trim() || null,
      topic,
      details: details || null,
      status,
      ownerId: str(input.ownerId).trim() || null,
      lastContactAt: last.value,
      lastContactNote: note || null,
      nextFollowUp: next.value,
      sourceLink: source.value,
    },
  };
}

// What the "Create task" button on an Inbox proposal fills in: the customer and project of the proposal, its one-line
// summary as the topic, the day of the email as the last correspondence (with who sent it and its subject, which are
// not the email's text), and the link to the email. Nothing is saved until the person presses Add task.
export type PrefillSource = {
  summary: string;
  kindText: string;
  sourceFrom: string | null;
  sourceSubject: string | null;
  sourceReceivedAt: string | null; // ISO date or date-time
  sourceLink: string | null;
};
export function taskPrefillFromSuggestion(s: PrefillSource, customerId: string, projectId: string): Partial<TaskInput> {
  const day = s.sourceReceivedAt && /^\d{4}-\d{2}-\d{2}/.test(s.sourceReceivedAt) ? s.sourceReceivedAt.slice(0, 10) : "";
  const email = [s.sourceFrom && `from ${s.sourceFrom}`, s.sourceSubject && `“${s.sourceSubject}”`].filter(Boolean).join(" ");
  const topic = oneLine(s.summary);
  return {
    customerId,
    projectId,
    topic: topic.length > MAX_TOPIC ? `${topic.slice(0, MAX_TOPIC - 1).trimEnd()}…` : topic,
    details: `Created from an Inbox proposal (${s.kindText}).${email ? ` Email ${email}.` : ""}`.slice(0, MAX_DETAILS),
    lastContactAt: validDate(day) ? day : "",
    lastContactNote: email ? `Email ${email}`.slice(0, MAX_CONTACT_NOTE) : "",
    sourceLink: s.sourceLink ?? "",
  };
}

// ---- an approved action item becomes a task (the two are one concept: a thing someone has to do or chase) ----

// The one active person whose full name appears in `who` ("Leora Penn", "leora penn (Solargik)"). Nobody when none or
// several match, or when `who` is empty: a first name alone is never matched, so "Leora / Amit" picks no one.
export function matchOwner(who: string | null | undefined, people: { id: string; name: string }[]): string | null {
  const w = oneLine(who).toLowerCase();
  if (!w) return null;
  const hits = people.filter((p) => {
    const n = oneLine(p.name).toLowerCase();
    return n.length >= 3 && (w === n || w.includes(n));
  });
  return hits.length === 1 ? hits[0].id : null;
}

export type ActionItemSource = PrefillSource & {
  text: string; // the request or commitment, as written in the proposal
  who: string | null;
  by: string | null; // when it is due, as the email says ("2026-10-20", "end of next week")
};

// What the task made from an action item holds. `by` becomes the follow-up date only when it is a real date
// (YYYY-MM-DD); anything else ("asap", "end of next week") stays in the details as written, never guessed into a date.
export function taskFromActionItem(a: ActionItemSource, customerId: string, projectId: string, people: { id: string; name: string }[]): Partial<TaskInput> {
  const base = taskPrefillFromSuggestion(a, customerId, projectId);
  const by = oneLine(a.by);
  const isDate = validDate(by);
  const lines = [
    block(a.text),
    oneLine(a.who) ? `For: ${oneLine(a.who)}` : "",
    by && !isDate ? `Due: ${by}` : "",
    base.lastContactNote ? `From the email: ${base.lastContactNote.replace(/^Email /, "")}.` : "",
  ].filter(Boolean);
  return {
    ...base,
    details: lines.join("\n").slice(0, MAX_DETAILS),
    status: "OPEN",
    ownerId: matchOwner(a.who, people) ?? "",
    nextFollowUp: isDate ? by : "",
  };
}
// A log entry: what happened, and on which day (today when not given).
export function cleanTaskUpdate(input: { date?: unknown; text?: unknown }, todayIso: string): Result<{ date: string; text: string }> {
  const text = block(input.text);
  if (!text) return { ok: false, error: "Write what happened." };
  if (text.length > MAX_UPDATE_TEXT) return { ok: false, error: `An entry can be at most ${MAX_UPDATE_TEXT} characters.` };
  const d = date(input.date, "The date");
  if (!d.ok) return d;
  return { ok: true, value: { date: d.value ?? todayIso, text } };
}

// ---- the filter chips on the Tasks page ----

export const TASK_FILTERS = [
  { key: "open", label: "Open" },
  { key: "attention", label: "Needs attention" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number]["key"];
export const parseTaskFilter = (v: unknown): TaskFilter => (TASK_FILTERS.some((f) => f.key === v) ? (v as TaskFilter) : "open");

// ---- the order of the tasks on the Tasks tab (?sort=) ----

export const TASK_SORTS = [
  { key: "urgent", label: "Most urgent" },
  { key: "upcoming", label: "Upcoming" },
  { key: "newest", label: "Newest first" },
  { key: "customer", label: "Customer A–Z" },
  { key: "project", label: "Project" },
] as const;
export type TaskSort = (typeof TASK_SORTS)[number]["key"];
export const parseTaskSort = (v: unknown): TaskSort => (TASK_SORTS.some((s) => s.key === v) ? (v as TaskSort) : "urgent");

// The number at the start of a project name ("259-Rignano Flaminio 1" -> 259); a task with no project (or a name with no
// number) sorts after every numbered project.
function projectSortKey(name: string | null | undefined): number {
  const n = Number(/^(\d{1,6})/.exec((name ?? "").trim())?.[1]);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
// Most urgent: overdue, due today, quiet, then the rest (compareTasks). Upcoming: the soonest follow-up date first, so an
// overdue one leads and a task with no follow-up date comes last (ties: most urgent first). Newest first: the day each
// task was created, latest first. Customer A-Z: by the customer's name. Project: by project number. All of them fall back
// to most urgent first for ties. Resolved tasks always come last.
export function compareForSort<T extends TaskTimes & { customerName?: string; projectName?: string | null }>(sort: TaskSort, a: T, b: T, todayIso: string): number {
  if (sort === "urgent") return compareTasks(a, b, todayIso);
  const resolved = Number(a.status === "RESOLVED") - Number(b.status === "RESOLVED");
  if (resolved !== 0) return resolved;
  if (sort === "customer") {
    const byName = (a.customerName ?? "").localeCompare(b.customerName ?? "", undefined, { sensitivity: "base" });
    if (byName !== 0) return byName;
  } else if (sort === "project") {
    // by project number (a name like "259-Rignano Flaminio 1"), a customer's general tasks (no project) after its projects
    const na = projectSortKey(a.projectName);
    const nb = projectSortKey(b.projectName);
    if (na !== nb) return na < nb ? -1 : 1;
    const byName = (a.customerName ?? "").localeCompare(b.customerName ?? "", undefined, { sensitivity: "base" });
    if (byName !== 0) return byName;
  } else if (sort === "upcoming") {
    const fa = a.nextFollowUp ?? "9999-12-31";
    const fb = b.nextFollowUp ?? "9999-12-31";
    if (fa !== fb) return fa < fb ? -1 : 1;
  } else if (a.createdOn !== b.createdOn) {
    return a.createdOn < b.createdOn ? 1 : -1;
  }
  return compareTasks(a, b, todayIso);
}

export function matchesFilter(t: TaskTimes, filter: TaskFilter, todayIso: string): boolean {
  if (filter === "all") return true;
  if (filter === "resolved") return t.status === "RESOLVED";
  if (filter === "open") return t.status !== "RESOLVED";
  return taskAttention(t, todayIso) !== null;
}
