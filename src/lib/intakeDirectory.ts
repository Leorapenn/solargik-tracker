import { groupContacts, type ContactRow } from "@/lib/contacts";

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

export type CustomerView = {
  id: string;
  name: string;
  aliases: string[];
  emailDomains: string[];
  contacts: { name: string; email: string | null; role: string | null }[];
};

export type CustomerSource = {
  id: string;
  name: string;
  aliases: { alias: string }[];
  contacts: { id: string; name: string; email: string | null; role: string | null }[];
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
  phases: { phase: string; status: string }[]; // each phase's status: NOT_STARTED | IN_PROGRESS | BLOCKED | DONE
};

export type ProjectSource = {
  id: string;
  name: string;
  lifecycle: string;
  mondayStage: string | null;
  mondayStatus: string | null;
  sharepointLink: string | null;
  customer: { id: string; name: string };
  phases: { name: string; status: string; order: number }[];
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
    phases: [...p.phases].sort((a, b) => a.order - b.order).map((ph) => ({ phase: ph.name, status: ph.status })),
  };
}
