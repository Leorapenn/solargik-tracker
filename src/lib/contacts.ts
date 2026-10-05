export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
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
        role: row.role,
        englishLevel: row.englishLevel,
        deletable: row.source === "MANUAL",
        projects: row.projectId && row.projectName ? [{ id: row.projectId, name: row.projectName }] : [],
      });
      continue;
    }
    group.ids.push(row.id);
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
