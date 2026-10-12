// What the project page's "Correspondence and actions" card shows: the notes and action items proposed from emails
// that a person APPROVED for this project. Approving them applies nothing; this card is where they are kept.

export const CORRESPONDENCE_KINDS = ["ACTION_ITEM", "CORRESPONDENCE_NOTE", "NOTE"] as const;
export type CorrespondenceKind = (typeof CORRESPONDENCE_KINDS)[number];

export type CorrespondenceItem = {
  id: string;
  kind: CorrespondenceKind;
  kindLabel: "Action" | "Note";
  summary: string;
  text: string | null; // the longer text, when it adds something to the one-line summary
  who: string | null; // action items: who it is for
  by: string | null; // action items: when it is due, as written in the email
  from: string | null;
  subject: string | null;
  link: string | null;
  fileLink?: string | null; // notes only: a saved document that belongs with the note (SharePoint)
  date: string; // YYYY-MM-DD: the day the email was received, else the day it was approved
  done: boolean; // action items only: ticked as done
  doneOn: string | null; // YYYY-MM-DD
};

export type CorrespondenceRow = {
  id: string;
  kind: string;
  summary: string;
  payload: unknown;
  sourceFrom: string | null;
  sourceSubject: string | null;
  sourceLink: string | null;
  sourceReceivedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  doneAt?: Date | null;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function shapeCorrespondence(row: CorrespondenceRow): CorrespondenceItem | null {
  if (!(CORRESPONDENCE_KINDS as readonly string[]).includes(row.kind)) return null;
  const payload = (typeof row.payload === "object" && row.payload !== null ? row.payload : {}) as Record<string, unknown>;
  const body = text(payload.text);
  return {
    id: row.id,
    kind: row.kind as CorrespondenceKind,
    kindLabel: row.kind === "ACTION_ITEM" ? "Action" : "Note",
    summary: row.summary,
    text: body && body !== row.summary ? body : null,
    who: row.kind === "ACTION_ITEM" ? text(payload.who) : null,
    by: row.kind === "ACTION_ITEM" ? text(payload.by) : null,
    from: row.sourceFrom,
    subject: row.sourceSubject,
    link: row.sourceLink,
    fileLink: row.kind === "CORRESPONDENCE_NOTE" ? text(payload.fileLink) : null,
    date: day(row.sourceReceivedAt ?? row.reviewedAt ?? row.createdAt),
    done: row.kind === "ACTION_ITEM" && Boolean(row.doneAt),
    doneOn: row.kind === "ACTION_ITEM" && row.doneAt ? day(row.doneAt) : null,
  };
}

// Newest first (by the email's day, then by id so the order is stable).
export function shapeAndSort(rows: CorrespondenceRow[]): CorrespondenceItem[] {
  return rows
    .map(shapeCorrespondence)
    .filter((x): x is CorrespondenceItem => x !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
