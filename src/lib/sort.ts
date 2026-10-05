export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir };
export type SortValue = string | number | Date | null | undefined;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Reads ?sort=&dir= from the URL. Unknown columns or directions fall back to the default.
export function parseSort(params: SearchParams, allowed: readonly string[], fallback: SortState): SortState {
  const key = first(params.sort);
  if (!key || !allowed.includes(key)) return fallback;
  const dir = first(params.dir);
  return { key, dir: dir === "desc" ? "desc" : "asc" };
}

function toComparable(value: SortValue): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  return value;
}

// Stable sort. Empty values always go last, whichever direction is chosen.
export function sortRows<T>(rows: readonly T[], accessors: Record<string, (row: T) => SortValue>, sort: SortState): T[] {
  const accessor = accessors[sort.key];
  if (!accessor) return [...rows];
  const factor = sort.dir === "asc" ? 1 : -1;

  return rows
    .map((row, index) => ({ row, index, value: toComparable(accessor(row)) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      let result: number;
      if (typeof a.value === "number" && typeof b.value === "number") result = a.value - b.value;
      else
        result = String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: "base" });
      return result === 0 ? a.index - b.index : result * factor;
    })
    .map((entry) => entry.row);
}

// Builds a link that keeps every other query parameter (filters, etc.) and replaces the given ones.
export function hrefWith(basePath: string, params: SearchParams, changes: Record<string, string | undefined>): string {
  const merged = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = first(raw);
    if (value !== undefined && !(key in changes)) merged.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) if (value !== undefined) merged.set(key, value);
  const query = merged.toString();
  return query ? `${basePath}?${query}` : basePath;
}

// Clicking the active column flips its direction; clicking another starts ascending.
export function sortHref(basePath: string, params: SearchParams, key: string, current: SortState): string {
  const dir: SortDir = current.key === key && current.dir === "asc" ? "desc" : "asc";
  return hrefWith(basePath, params, { sort: key, dir });
}
