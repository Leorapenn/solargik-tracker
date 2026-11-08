import type { Department, PhaseName } from "@prisma/client";
import { DEPARTMENTS } from "@/lib/departments";
import { PHASE_ORDER } from "@/lib/phases";

// The department overview: how each department's items stand across the active projects, in quick numbers and bars. Pure rules; the
// page loads the items (src/server/services/overview.ts). N/A items are never loaded: they do not count as work.

export const OVERVIEW_STATUSES = ["DONE", "IN_PROGRESS", "BLOCKED", "NOT_STARTED"] as const;
export type OverviewStatus = (typeof OVERVIEW_STATUSES)[number];
export type StatusCounts = Record<OverviewStatus, number>;

export type OverviewItem = {
  id: string;
  projectId: string;
  projectName: string;
  customerName: string;
  phase: PhaseName;
  item: string;
  department: Department;
  status: OverviewStatus;
  ownerName: string | null;
  targetDate: string | null; // YYYY-MM-DD
};

const DAY = 24 * 60 * 60 * 1000;
const days = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

// Open and past its target date.
export const isOverdue = (item: Pick<OverviewItem, "status" | "targetDate">, todayIso: string): boolean => item.status !== "DONE" && item.targetDate !== null && item.targetDate < todayIso;

export const daysOverdue = (item: Pick<OverviewItem, "targetDate">, todayIso: string): number => (item.targetDate ? Math.max(0, Math.round(days(todayIso) - days(item.targetDate))) : 0);

export function countStatuses(items: Pick<OverviewItem, "status">[]): StatusCounts {
  const counts: StatusCounts = { DONE: 0, IN_PROGRESS: 0, BLOCKED: 0, NOT_STARTED: 0 };
  for (const i of items) counts[i.status]++;
  return counts;
}

export type Summary = { total: number; counts: StatusCounts; donePercent: number; blocked: number; overdue: number };

export function summarize(items: OverviewItem[], todayIso: string): Summary {
  const counts = countStatuses(items);
  const total = items.length;
  return { total, counts, donePercent: total ? Math.round((counts.DONE / total) * 100) : 0, blocked: counts.BLOCKED, overdue: items.filter((i) => isOverdue(i, todayIso)).length };
}

export const inDepartment = (items: OverviewItem[], department: Department | null): OverviewItem[] => (department ? items.filter((i) => i.department === department) : items);

// Per phase, in project order; only the phases that have items.
export function byPhase(items: OverviewItem[]): { phase: PhaseName; total: number; counts: StatusCounts }[] {
  return PHASE_ORDER.map((phase) => {
    const own = items.filter((i) => i.phase === phase);
    return { phase, total: own.length, counts: countStatuses(own) };
  }).filter((p) => p.total > 0);
}

// The work still open per person (items not done), most first; the items nobody owns come last.
export function byOwner(items: OverviewItem[], todayIso: string): { name: string | null; open: number; blocked: number; overdue: number }[] {
  const map = new Map<string | null, { name: string | null; open: number; blocked: number; overdue: number }>();
  for (const i of items) {
    if (i.status === "DONE") continue;
    const row = map.get(i.ownerName) ?? { name: i.ownerName, open: 0, blocked: 0, overdue: 0 };
    row.open++;
    if (i.status === "BLOCKED") row.blocked++;
    if (isOverdue(i, todayIso)) row.overdue++;
    map.set(i.ownerName, row);
  }
  return [...map.values()].sort((a, b) => Number(a.name === null) - Number(b.name === null) || b.open - a.open || (a.name ?? "").localeCompare(b.name ?? ""));
}

const byProject = (a: OverviewItem, b: OverviewItem) => a.projectName.localeCompare(b.projectName, undefined, { numeric: true }) || a.item.localeCompare(b.item);

// What needs a look: blocked items, then the overdue ones (the longest overdue first).
export function needsAttention(items: OverviewItem[], todayIso: string): OverviewItem[] {
  const blocked = items.filter((i) => i.status === "BLOCKED").sort((a, b) => daysOverdue(b, todayIso) - daysOverdue(a, todayIso) || byProject(a, b));
  const late = items.filter((i) => i.status !== "BLOCKED" && isOverdue(i, todayIso)).sort((a, b) => daysOverdue(b, todayIso) - daysOverdue(a, todayIso) || byProject(a, b));
  return [...blocked, ...late];
}

export const withStatus = (items: OverviewItem[], status: OverviewStatus): OverviewItem[] => items.filter((i) => i.status === status).sort(byProject);

export function parseDepartment(value: string | string[] | undefined): Department | null {
  const v = Array.isArray(value) ? value[0] : value;
  return DEPARTMENTS.find((d) => d === v) ?? null;
}

export function parseOverviewStatus(value: string | string[] | undefined): OverviewStatus | null {
  const v = Array.isArray(value) ? value[0] : value;
  return OVERVIEW_STATUSES.find((s) => s === v) ?? null;
}
