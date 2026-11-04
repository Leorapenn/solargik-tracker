// The Sunday meeting agenda: updates by project, grouped by the project's stage. The updates come from the emails the agent
// read (proposals a person APPROVED in the Inbox, by the day of the email) and from phase / item updates typed on a project.

// The stages in meeting order (the project's monday.com "Status"): the ones being worked on first, then the rest.
export const STAGE_ORDER = ["Logistics", "Design", "Construction", "Commissioning", "O&M Phase", "Pre NTP", "Stuck/On Hold", "Cancelled"] as const;
export const NO_STAGE = "No stage";

export const stageOf = (mondayStatus: string | null | undefined): string => (mondayStatus && mondayStatus.trim() ? mondayStatus.trim() : NO_STAGE);

// Position of a stage in the meeting order; a stage nobody listed goes after the known ones, "No stage" last.
export function stageRank(stage: string): number {
  const i = STAGE_ORDER.findIndex((s) => s.toLowerCase() === stage.toLowerCase());
  if (i >= 0) return i;
  return stage === NO_STAGE ? STAGE_ORDER.length + 1 : STAGE_ORDER.length;
}

export type StageGroup<T> = { stage: string; projects: T[] };

// Groups items that carry a `stage` and a `name` by stage in meeting order; projects inside a stage by number (87 before 259).
export function groupByStage<T extends { stage: string; name: string }>(projects: T[]): StageGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const p of projects) {
    const key = [...map.keys()].find((k) => k.toLowerCase() === p.stage.toLowerCase()) ?? p.stage;
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => stageRank(a) - stageRank(b) || a.localeCompare(b))
    .map(([stage, list]) => ({ stage, projects: [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) }));
}

// What an approved proposal tells the meeting, by kind (a new contact is not news for the meeting).
export const AGENDA_KIND_LABELS: Record<string, string> = {
  CORRESPONDENCE_NOTE: "Email",
  NOTE: "Note",
  ACTION_ITEM: "New task",
  TASK_UPDATE: "Task update",
  STATUS_CHANGE: "Status",
  PHASE_UPDATE: "Phase update",
  ITEM_UPDATE: "Item update",
  SHIPMENT_UPDATE: "Shipment",
  MILESTONE_UPDATE: "Payment",
  CHANGE_ORDER: "Change order",
  CHANGE_ORDER_UPDATE: "Change order",
  CONTRACT_DOCUMENT: "Contract",
  SITE_INFO: "Site info",
  NEW_PROJECT: "New project",
};
export const AGENDA_KINDS = Object.keys(AGENDA_KIND_LABELS);

export type EmailEntry = {
  id: string;
  kind: string;
  label: string;
  summary: string; // the one-line headline the agent wrote
  subject: string | null; // the email's subject, shown as the link to the email
  link: string | null;
  date: string; // YYYY-MM-DD: the day of the email, else the day it was approved
};

// Only a web link is ever turned into a link.
const safeLink = (v: string | null | undefined) => (v && /^https?:\/\//i.test(v) ? v : null);

export type EmailRow = {
  id: string;
  kind: string;
  summary: string;
  sourceSubject: string | null;
  sourceLink: string | null;
  sourceReceivedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

// null for a kind the meeting does not need to hear about. Only the subject, the link and the one-line headline are kept.
export function shapeEmailEntry(row: EmailRow): EmailEntry | null {
  const label = AGENDA_KIND_LABELS[row.kind];
  if (!label) return null;
  return {
    id: row.id,
    kind: row.kind,
    label,
    summary: row.summary.replace(/\s+/g, " ").trim(),
    subject: row.sourceSubject?.replace(/\s+/g, " ").trim() || null,
    link: safeLink(row.sourceLink),
    date: (row.sourceReceivedAt ?? row.reviewedAt ?? row.createdAt).toISOString().slice(0, 10),
  };
}

// Newest first, then by id so the order is stable.
export const sortEmailEntries = (list: EmailEntry[]): EmailEntry[] => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
