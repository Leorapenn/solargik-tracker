// A phone number as typed ("+39 06 1234 5678", "(050) 791-7125"): digits, spaces and + ( ) . - only, 5 to 20 digits.
export function checkPhone(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return { ok: true, value: null };
  if (value.length > 40 || !/^\+?[\d\s().-]+$/.test(value)) return { ok: false, error: "That phone number doesn't look right. Use digits, spaces and + ( ) - only." };
  const digits = value.replace(/\D/g, "").length;
  if (digits < 5 || digits > 20) return { ok: false, error: "A phone number has between 5 and 20 digits." };
  return { ok: true, value };
}

export type CustomerManagerInput = { name: string; email: string; phone: string };
export type CleanCustomerManager = { name: string | null; email: string | null; phone: string | null };

// The project manager on the customer's side: a name (required once anything is given), optional email and phone.
// All empty clears it.
export function cleanCustomerManager(input: Partial<Record<keyof CustomerManagerInput, unknown>>): { ok: true; value: CleanCustomerManager } | { ok: false; error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const name = str(input.name);
  const email = str(input.email);
  const phone = checkPhone(str(input.phone));
  if (!phone.ok) return phone;
  if (!name && !email && !phone.value) return { ok: true, value: { name: null, email: null, phone: null } };
  if (!name) return { ok: false, error: "Add the manager's name." };
  if (name.length > 120) return { ok: false, error: "The name is too long." };
  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, error: "That email address doesn't look right." };
  return { ok: true, value: { name, email: email || null, phone: phone.value } };
}

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  role: string | null;
  englishLevel: string | null;
  source: "IMPORTED" | "MANUAL";
  projectId: string | null;
  projectName: string | null;
};

export type ContactPerson = {
  key: string;
  // every underlying row (one per project the person appears on), so an edit can update them all
  ids: string[];
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  englishLevel: string | null;
  deletable: boolean;
  projects: { id: string; name: string }[];
};

// The same person is usually listed on several projects. Merge them into one entry, keyed by email
// (case-insensitive), or by name when there is no email.
export function groupContacts(rows: ContactRow[]): ContactPerson[] {
  const groups = new Map<string, ContactPerson>();

  for (const row of rows) {
    const key = row.email ? `email:${row.email.trim().toLowerCase()}` : `name:${row.name.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        key,
        ids: [row.id],
        name: row.name,
        email: row.email,
        phone: row.phone ?? null,
        role: row.role,
        englishLevel: row.englishLevel,
        deletable: row.source === "MANUAL",
        projects: row.projectId && row.projectName ? [{ id: row.projectId, name: row.projectName }] : [],
      });
      continue;
    }
    group.ids.push(row.id);
    group.phone ??= row.phone ?? null;
    group.role ??= row.role;
    group.englishLevel ??= row.englishLevel;
    // only a person who exists purely as hand-added entries can be deleted here
    group.deletable = group.deletable && row.source === "MANUAL";
    if (row.projectId && row.projectName && !group.projects.some((p) => p.id === row.projectId)) {
      group.projects.push({ id: row.projectId, name: row.projectName });
    }
  }

  return [...groups.values()]
    .map((g) => ({ ...g, projects: g.projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) }))
    .sort((a, b) => b.projects.length - a.projects.length || a.name.localeCompare(b.name));
}
