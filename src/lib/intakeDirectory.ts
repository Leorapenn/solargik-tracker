import { groupContacts, type ContactRow } from "@/lib/contacts";
import { stripSubject } from "@/lib/threads";

// What the email agent may READ, to tell which customer and project an email is about. Each view is built field by
// field from this explicit list, so a column added to the database later (contract values, file links, prices...)
// can never end up in the output by accident. Nothing here is writable.

// Mail providers anyone can use: an address there says nothing about which customer a person works for.
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "mail.com", "walla.co.il", "walla.com",
]);

// "Dan@Revalue.com" -> "revalue.com"; null for anything that isn't an email address.
export function emailDomain(email: string | null | undefined): string | null {
  const t = (email ?? "").trim().toLowerCase();
  const m = /^[^\s@]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.exec(t);
  return m ? m[1] : null;
}

// "259-Rignano Flaminio 1" / "259 Rignano Flaminio 1" -> "259" (the same rule the Inbox uses to match a project).
export function projectNumber(name: string): string | null {
  return /^(\d{2,4})(?!\d)/.exec(name.trim())?.[1] ?? null;
}

// The project's name without its number: "259-Rignano Flaminio 1" -> "Rignano Flaminio 1".
export function projectNamePart(name: string): string {
  return name.trim().replace(/^\d{2,4}(?!\d)\s*[-–:.)]?\s*/, "").trim();
}

// The last part of a SharePoint folder link, as the folder is named there ("259 (Revalue, Rignano Flaminio 1, Italy)").
// Only the NAME is used, as one more label emails may use for the project; the link itself is never output.
export function folderNameFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const parts = new URL(link).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) return null;
    const name = decodeURIComponent(last).trim();
    return name ? name.slice(0, 200) : null;
  } catch {
    return null;
  }
}

// What was already proposed from emails in the last RECENT_DAYS days (any status, rejected ones included so they are not
// proposed again), so the agent proposes only what is NEW in an email and not what an earlier email of the chain already
// gave. Our own one-line summaries and the email's subject only: nothing else from the proposal.
export const RECENT_DAYS = 14;
export const MAX_RECENT_PER_PROJECT = 30;
export type RecentProposal = { status: string; kind: string; summary: string; thread: string | null; day: string };
export type RecentSource = { status: string; kind: string; summary: string; sourceSubject: string | null; sourceReceivedAt: Date | null; createdAt: Date };

export function shapeRecent(list: RecentSource[] | undefined): RecentProposal[] {
  return (list ?? []).slice(0, MAX_RECENT_PER_PROJECT).map((s) => ({
    status: s.status,
    kind: s.kind,
    summary: s.summary.slice(0, 200),
    thread: stripSubject(s.sourceSubject).slice(0, 120) || null,
    day: (s.sourceReceivedAt ?? s.createdAt).toISOString().slice(0, 10),
  }));
}

// The tasks still open (resolved ones are never listed), so an email that answers one can name it (TASK_UPDATE). Only the
// task's one-line topic, state, owner's name and last correspondence day, plus the email chain it started in (the subject
// and the conversation id, when the task was made from an email): never its details, notes or log.
export type OpenTaskView = { id: string; topic: string; status: string; owner: string | null; lastContact: string | null; thread: string | null; conversationId: string | null };
export type OpenTaskSource = { id: string; topic: string; status: string; ownerName: string | null; lastContactAt: string | null; subjects: string[]; conversationIds: string[]; subjectText?: string | null };
export const MAX_OPEN_TASKS_PER_OWNER = 30;

export function shapeOpenTasks(list: OpenTaskSource[] | undefined): OpenTaskView[] {
  return (list ?? []).slice(0, MAX_OPEN_TASKS_PER_OWNER).map((t) => ({
    id: t.id,
    topic: t.topic.slice(0, 150),
    status: t.status,
    owner: t.ownerName,
    lastContact: t.lastContactAt,
    thread: (t.subjectText ?? t.subjects[0] ?? "").slice(0, 120) || null,
    conversationId: t.conversationIds[0] ?? null,
  }));
}

export type CustomerView = {
  id: string;
  name: string;
  aliases: string[];
  emailDomains: string[];
  contacts: { name: string; email: string | null; role: string | null }[];
  // proposals about this customer in general (no project) in the last two weeks
  recentProposals: RecentProposal[];
  // this customer's open tasks that are not tied to a project
  openTasks: OpenTaskView[];
};

export type CustomerSource = {
  id: string;
  name: string;
  aliases: { alias: string }[];
  contacts: { id: string; name: string; email: string | null; role: string | null }[];
  recentSuggestions?: RecentSource[]; // newest first
  openTasks?: OpenTaskSource[];
};

export function shapeCustomer(c: CustomerSource): CustomerView {
  const rows: ContactRow[] = c.contacts.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, englishLevel: null, source: "IMPORTED", projectId: null, projectName: null }));
  const domains = new Set<string>();
  for (const p of c.contacts) {
    const d = emailDomain(p.email);
    if (d && !FREE_MAIL_DOMAINS.has(d)) domains.add(d);
  }
  return {
    id: c.id,
    name: c.name,
    aliases: c.aliases.map((a) => a.alias).sort((a, b) => a.localeCompare(b)),
    emailDomains: [...domains].sort(),
    // the same person on several projects is listed once
    contacts: groupContacts(rows).map((p) => ({ name: p.name, email: p.email, role: p.role })),
    recentProposals: shapeRecent(c.recentSuggestions),
    openTasks: shapeOpenTasks(c.openTasks),
  };
}

export type ProjectView = {
  id: string;
  number: string | null;
  name: string;
  aliases: string[];
  customer: { id: string; name: string };
  lifecycle: string; // ACTIVE | PRE_NTP | ON_HOLD | SUSPENDED | CANCELLED
  stage: string | null; // the monday.com stage label
  status: string | null; // the monday.com status label
  // each phase's status (NOT_STARTED | IN_PROGRESS | BLOCKED | DONE) and its current typed update with the day it was last changed
  phases: { phase: string; status: string; update: { text: string; date: string } | null }[];
  // proposals already waiting for a person's review (newest first), so the agent doesn't propose the same again
  pendingProposals: { kind: string; summary: string }[];
  // everything proposed for this project in the last two weeks, whatever its status (newest first): see RecentProposal
  recentProposals: RecentProposal[];
  // the project's open tasks (see OpenTaskView), so an email that answers one can update or resolve it
  openTasks: OpenTaskView[];
  // the project's change orders (their names and state only, no amounts), so an invoice can update the right one
  changeOrders: { name: string; status: string; invoiceStatus: string | null }[];
  // the project's payment milestones in order (name, the percent of the contract, state): never an amount, a date or a link.
  // With them an invoice that says "Advance payment 35%" can be matched to the one milestone it belongs to.
  milestones: { name: string; percent: number | null; status: string }[];
};

// Percent as a number, or null when the milestone is a typed amount (no percent) or the value is not a number.
const percentNumber = (v: { toString(): string } | string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
};

export const MAX_PENDING_PER_PROJECT = 15;
const MAX_UPDATE_TEXT = 600;

export type ProjectSource = {
  id: string;
  name: string;
  lifecycle: string;
  mondayStage: string | null;
  mondayStatus: string | null;
  sharepointLink: string | null;
  customer: { id: string; name: string };
  phases: { name: string; status: string; order: number; statusUpdate: string | null; statusUpdateAt: Date | null }[];
  suggestions: { kind: string; summary: string }[]; // PENDING ones, newest first
  recentSuggestions?: RecentSource[]; // the last two weeks, any status, newest first
  openTasks?: OpenTaskSource[];
  changeOrders: { reason: string; status: string; invoiceStatus: string | null }[];
  milestones?: { label: string; percent: { toString(): string } | string | number | null; order: number; status: string }[];
};

export function shapeProject(p: ProjectSource): ProjectView {
  const number = projectNumber(p.name);
  const seen = new Set([p.name.trim().toLowerCase()]);
  const aliases: string[] = [];
  for (const candidate of [number, projectNamePart(p.name), folderNameFromLink(p.sharepointLink)]) {
    const t = candidate?.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    aliases.push(t);
  }
  return {
    id: p.id,
    number,
    name: p.name,
    aliases,
    customer: { id: p.customer.id, name: p.customer.name },
    lifecycle: p.lifecycle,
    stage: p.mondayStage,
    status: p.mondayStatus,
    phases: [...p.phases]
      .sort((a, b) => a.order - b.order)
      .map((ph) => ({
        phase: ph.name,
        status: ph.status,
        update: ph.statusUpdate?.trim() && ph.statusUpdateAt ? { text: ph.statusUpdate.trim().slice(0, MAX_UPDATE_TEXT), date: ph.statusUpdateAt.toISOString().slice(0, 10) } : null,
      })),
    pendingProposals: p.suggestions.slice(0, MAX_PENDING_PER_PROJECT).map((s) => ({ kind: s.kind, summary: s.summary })),
    recentProposals: shapeRecent(p.recentSuggestions),
    openTasks: shapeOpenTasks(p.openTasks),
    changeOrders: p.changeOrders.map((c) => ({ name: c.reason.replace(/\s+/g, " ").trim().slice(0, 150), status: c.status, invoiceStatus: c.invoiceStatus })),
    milestones: [...(p.milestones ?? [])].sort((a, b) => a.order - b.order).map((m) => ({ name: m.label.replace(/\s+/g, " ").trim().slice(0, 100), percent: percentNumber(m.percent), status: m.status })),
  };
}
