import type { CorrespondenceItem } from "@/lib/correspondence";

// The Actions tab: every approved action item (a clear request or commitment found in an email), grouped by the
// project it is about, or the customer when it is general, with open / done.

export type ActionStatusFilter = "open" | "done" | "all";
export const ACTION_FILTERS: { key: ActionStatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

export type ActionRow = CorrespondenceItem & {
  projectId: string | null;
  projectName: string | null;
  customerId: string | null;
  customerName: string | null;
};

export type ActionGroup = { key: string; title: string; href: string | null; items: ActionRow[] };

export function parseStatusFilter(raw: string | string[] | undefined): ActionStatusFilter {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase();
  return v === "done" || v === "all" ? v : "open";
}

// "p:<project id>" or "c:<customer id>" (a customer's general items); anything else means everything.
export function parseScope(raw: string | string[] | undefined): { kind: "project" | "customer"; id: string } | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const m = /^([pc]):([A-Za-z0-9_-]{1,64})$/.exec(v ?? "");
  return m ? { kind: m[1] === "p" ? "project" : "customer", id: m[2] } : null;
}

export function applyFilters(rows: ActionRow[], status: ActionStatusFilter, scope: ReturnType<typeof parseScope>): ActionRow[] {
  return rows.filter((r) => {
    if (status === "open" && r.done) return false;
    if (status === "done" && !r.done) return false;
    if (scope?.kind === "project" && r.projectId !== scope.id) return false;
    if (scope?.kind === "customer" && !(r.projectId === null && r.customerId === scope.id)) return false;
    return true;
  });
}

export function countByStatus(rows: ActionRow[]): { open: number; done: number; all: number } {
  const done = rows.filter((r) => r.done).length;
  return { open: rows.length - done, done, all: rows.length };
}

// Groups in a fixed order: projects by name (259 before 1000), then a customer's general items, then the ones with
// neither. Inside a group the newest email is first.
export function groupActions(rows: ActionRow[]): ActionGroup[] {
  const groups = new Map<string, ActionGroup>();
  for (const r of rows) {
    const key = r.projectId ? `p:${r.projectId}` : r.customerId ? `c:${r.customerId}` : "none";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: r.projectName ?? (r.customerName ? `${r.customerName} (general)` : "No project or customer"),
        href: r.projectId ? `/projects/${r.projectId}` : r.customerId ? `/customers/${r.customerId}` : null,
        items: [],
      });
    }
    groups.get(key)!.items.push(r);
  }
  const rank = (g: ActionGroup) => (g.key.startsWith("p:") ? 0 : g.key.startsWith("c:") ? 1 : 2);
  return [...groups.values()]
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)) }))
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, undefined, { numeric: true }));
}
