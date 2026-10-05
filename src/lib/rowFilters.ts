import type { Department, PhaseName, StageStatus } from "@prisma/client";
import { DEPARTMENTS, departmentLabel } from "@/lib/departments";
import { PHASE_ORDER, phaseLabel } from "@/lib/phases";
import { STATUS_LABELS } from "@/lib/statusColors";

type SearchParams = Record<string, string | string[] | undefined>;

// Filters for the items table on a project page. Every column can be filtered; each filter lives in the URL
// (?status=DONE,BLOCKED&dept=FINANCE&owner=none&target=overdue&q=kickoff). Within one column the chosen
// values are alternatives (any of them); different columns all have to match.
export type DateMode = "set" | "none" | "na" | "overdue";

export const DATE_MODE_LABELS: Record<DateMode, string> = {
  set: "Has a date",
  none: "No date yet",
  na: "Not applicable (N/A)",
  overdue: "Overdue (past target, not done)",
};

export type FilterKey = "phase" | "q" | "dept" | "owner" | "target" | "started" | "completed" | "status";

export const FILTER_ORDER: FilterKey[] = ["phase", "q", "dept", "owner", "target", "started", "completed", "status"];
export const FILTER_LABELS: Record<FilterKey, string> = {
  phase: "Phase",
  q: "Sub-stage",
  dept: "Department",
  owner: "Owner",
  target: "Target",
  started: "Started",
  completed: "Completed",
  status: "Status",
};

export const UNASSIGNED = "none";
const STATUSES: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];
export const DATE_MODES_FOR: Record<"target" | "started" | "completed", DateMode[]> = {
  target: ["set", "none", "na", "overdue"],
  started: ["set", "none", "na"],
  completed: ["set", "none", "na"],
};

export type RowFilters = {
  phase: PhaseName[];
  q: string;
  dept: Department[];
  owner: string[];
  target: DateMode[];
  started: DateMode[];
  completed: DateMode[];
  status: StageStatus[];
};

export type FilterableRow = {
  phaseName: PhaseName;
  name: string;
  department: Department;
  ownerId: string | null;
  status: StageStatus;
  targetDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  naDates: string[];
};

const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);
const list = (raw: string | string[] | undefined) =>
  (first(raw) ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
// keeps only known values, in the canonical order
const known = <T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] => {
  const wanted = new Set(list(raw).map((v) => v.toUpperCase()));
  return allowed.filter((a) => wanted.has(a.toUpperCase()));
};
const modes = (raw: string | string[] | undefined, key: keyof typeof DATE_MODES_FOR): DateMode[] => {
  const wanted = new Set(list(raw).map((v) => v.toLowerCase()));
  return DATE_MODES_FOR[key].filter((m) => wanted.has(m));
};

export function parseRowFilters(params: SearchParams): RowFilters {
  return {
    phase: known(params.phase, PHASE_ORDER),
    q: (first(params.q) ?? "").trim().slice(0, 80),
    dept: known(params.dept, DEPARTMENTS),
    owner: [...new Set(list(params.owner))].slice(0, 30),
    target: modes(params.target, "target"),
    started: modes(params.started, "started"),
    completed: modes(params.completed, "completed"),
    status: known(params.status, STATUSES),
  };
}

// The URL values for one column (undefined = not filtered), for building links.
export function filterValue(filters: RowFilters, key: FilterKey): string[] {
  return key === "q" ? (filters.q ? [filters.q] : []) : (filters[key] as string[]);
}

export const activeFilterKeys = (filters: RowFilters): FilterKey[] => FILTER_ORDER.filter((k) => filterValue(filters, k).length > 0);

const DATE_FIELD = { target: "targetDate", started: "startedAt", completed: "completedAt" } as const;

function dateMatches(row: FilterableRow, key: keyof typeof DATE_FIELD, wanted: DateMode[], todayIso: string): boolean {
  const field = DATE_FIELD[key];
  const value = row[field];
  const na = row.naDates.includes(field);
  return wanted.some((mode) => {
    if (mode === "set") return value !== null;
    if (mode === "none") return value === null && !na;
    if (mode === "na") return na;
    return key === "target" && value !== null && value < todayIso && row.status !== "DONE";
  });
}

export function matchesFilters(row: FilterableRow, filters: RowFilters, todayIso: string): boolean {
  if (filters.phase.length && !filters.phase.includes(row.phaseName)) return false;
  if (filters.q && !row.name.toLowerCase().includes(filters.q.toLowerCase())) return false;
  if (filters.dept.length && !filters.dept.includes(row.department)) return false;
  if (filters.owner.length && !filters.owner.includes(row.ownerId ?? UNASSIGNED)) return false;
  if (filters.status.length && !filters.status.includes(row.status)) return false;
  for (const key of ["target", "started", "completed"] as const) {
    if (filters[key].length && !dateMatches(row, key, filters[key], todayIso)) return false;
  }
  return true;
}

// Human text for a filter chip: "Status: Done, Blocked".
export function describeFilter(filters: RowFilters, key: FilterKey, ownerNames: Record<string, string>): string {
  const labels = filterValue(filters, key).map((v) => {
    if (key === "phase") return phaseLabel(v as PhaseName);
    if (key === "dept") return departmentLabel(v as Department);
    if (key === "status") return STATUS_LABELS[v as StageStatus];
    if (key === "owner") return v === UNASSIGNED ? "Unassigned" : (ownerNames[v] ?? "Unknown");
    if (key === "q") return `"${v}"`;
    return DATE_MODE_LABELS[v as DateMode].replace(/ \(.*\)$/, "");
  });
  return `${FILTER_LABELS[key]}: ${labels.join(", ")}`;
}
