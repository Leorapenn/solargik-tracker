export type SortDir = "asc" | "desc";
export type SortKey = { key: string; dir: SortDir };
// An ordered list: sort by the first, break ties with the second, and so on.
export type SortState = SortKey[];
export type SortValue = string | number | Date | null | undefined;

type SearchParams = Record<string, string | string[] | undefined>;

const MAX_SORT_KEYS = 4;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const asState = (value: SortKey | SortKey[]): SortState => (Array.isArray(value) ? value : [value]);

// Reads ?sort=status:asc,contract:desc from the URL (the older ?sort=status&dir=asc still works).
// Unknown columns are ignored; if nothing usable is left, the page's default is used.
export function parseSort(params: SearchParams, allowed: readonly string[], fallback: SortKey | SortKey[]): SortState {
  const raw = first(params.sort);
  if (!raw) return asState(fallback);

  const legacyDir = first(params.dir);
  const result: SortState = [];
  for (const part of raw.split(",")) {
    const [key, dir] = part.split(":");
    if (!allowed.includes(key) || result.some((r) => r.key === key)) continue;
    result.push({ key, dir: (dir ?? legacyDir) === "desc" ? "desc" : "asc" });
    if (result.length === MAX_SORT_KEYS) break;
  }
  return result.length > 0 ? result : asState(fallback);
}

export function serializeSort(sort: SortState): string {
  return sort.map((s) => `${s.key}:${s.dir}`).join(",");
}

function toComparable(value: SortValue): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  return value;
}

// Stable multi-key sort. Empty values always go last, whichever direction is chosen.
export function sortRows<T>(rows: readonly T[], accessors: Record<string, (row: T) => SortValue>, sort: SortState): T[] {
  const keys = sort.filter((s) => accessors[s.key]);
  if (keys.length === 0) return [...rows];

  return rows
    .map((row, index) => ({ row, index, values: keys.map((s) => toComparable(accessors[s.key](row))) }))
    .sort((a, b) => {
      for (let i = 0; i < keys.length; i++) {
        const x = a.values[i];
        const y = b.values[i];
        if (x === null && y === null) continue;
        if (x === null) return 1;
        if (y === null) return -1;
        const result =
          typeof x === "number" && typeof y === "number"
            ? x - y
            : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
        if (result !== 0) return keys[i].dir === "asc" ? result : -result;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

// What a header click does.
//  replace (plain click): sort by just this column; clicking the same column again reverses it.
//  add (shift-click):     add this column as a further tie-breaker, or reverse it if it is already in the list.
export function nextSort(current: SortState, key: string, mode: "replace" | "add"): SortState {
  const existing = current.find((s) => s.key === key);
  const flipped: SortDir = existing?.dir === "asc" ? "desc" : "asc";

  if (mode === "replace") return [{ key, dir: existing ? flipped : "asc" }];
  if (existing) return current.map((s) => (s.key === key ? { key, dir: flipped } : s));
  return current.length >= MAX_SORT_KEYS ? current : [...current, { key, dir: "asc" }];
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

export function sortHref(
  basePath: string,
  params: SearchParams,
  key: string,
  current: SortState,
  mode: "replace" | "add" = "replace",
): string {
  return hrefWith(basePath, params, { sort: serializeSort(nextSort(current, key, mode)), dir: undefined });
}

// Drops one column from the sort. Removing the last one returns to the page's default order.
export function removeSortHref(basePath: string, params: SearchParams, key: string, current: SortState): string {
  const remaining = current.filter((s) => s.key !== key);
  return hrefWith(basePath, params, { sort: remaining.length ? serializeSort(remaining) : undefined, dir: undefined });
}
