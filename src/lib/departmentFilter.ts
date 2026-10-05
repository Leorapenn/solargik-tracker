import type { Department } from "@prisma/client";
import { DEPARTMENTS } from "@/lib/departments";

type SearchParams = Record<string, string | string[] | undefined>;

// The department filter lives in the URL as ?dept=FINANCE,DESIGN. No value means every department.
export function parseDepartments(params: SearchParams): Department[] {
  const raw = Array.isArray(params.dept) ? params.dept[0] : params.dept;
  if (!raw) return [];
  const wanted = new Set(raw.split(",").map((d) => d.trim().toUpperCase()));
  return DEPARTMENTS.filter((d) => wanted.has(d));
}

// The value to put back in the URL for a list of departments (undefined = no filter).
export function departmentsParam(list: Department[]): string | undefined {
  const ordered = DEPARTMENTS.filter((d) => list.includes(d));
  return ordered.length === 0 || ordered.length === DEPARTMENTS.length ? undefined : ordered.join(",");
}

export function toggleDepartment(current: Department[], department: Department): Department[] {
  return current.includes(department) ? current.filter((d) => d !== department) : [...current, department];
}

// Used by server actions on untrusted input: keeps only real department names.
export function cleanDepartments(input: unknown): Department[] {
  if (!Array.isArray(input)) return [];
  return DEPARTMENTS.filter((d) => input.includes(d));
}
