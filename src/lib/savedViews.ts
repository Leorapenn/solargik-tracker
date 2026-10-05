// Saved views: a named "?sort=...&dept=..." query for a page, kept in the person's own browser.
// A view is just the page's URL parameters, so it remembers whatever was set when it was saved
// (sort order, department filter, status filter...).
export type SavedView = { name: string; query: string };
export type ViewStore = Record<string, SavedView[]>;

export const VIEWS_STORAGE_KEY = "solargik.savedViews.v1";
export const MAX_VIEW_NAME = 40;
export const MAX_VIEWS_PER_PAGE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

// "/customers/abc123" and "/customers/xyz" share one list of views ("/customers/[id]").
export function scopeFor(basePath: string): string {
  return basePath.replace(/^\/(customers|projects)\/[^/]+$/, "/$1/[id]");
}

// The query as it would appear in the URL, in a fixed key order, so two spellings of the same view match.
export function canonicalQuery(input: string | SearchParams): string {
  const entries: [string, string][] = [];
  if (typeof input === "string") {
    for (const [k, v] of new URLSearchParams(input)) entries.push([k, v]);
  } else {
    for (const [k, raw] of Object.entries(input)) {
      const v = Array.isArray(raw) ? raw[0] : raw;
      if (v !== undefined && v !== "") entries.push([k, v]);
    }
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entries).toString();
}

export function parseStore(raw: string | null | undefined): ViewStore {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const store: ViewStore = {};
    for (const [scope, list] of Object.entries(data as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      store[scope] = list.filter(
        (v): v is SavedView => !!v && typeof v.name === "string" && typeof v.query === "string" && v.name.length > 0,
      );
    }
    return store;
  } catch {
    return {};
  }
}

export type SaveCheck = { ok: true; name: string } | { ok: false; error: string };

export function checkViewName(raw: string, existing: SavedView[]): SaveCheck {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give the view a name." };
  if (name.length > MAX_VIEW_NAME) return { ok: false, error: `At most ${MAX_VIEW_NAME} characters.` };
  const replacing = existing.some((v) => v.name.toLowerCase() === name.toLowerCase());
  if (!replacing && existing.length >= MAX_VIEWS_PER_PAGE) return { ok: false, error: `At most ${MAX_VIEWS_PER_PAGE} saved views per page.` };
  return { ok: true, name };
}

// Saving under an existing name replaces that view.
export function upsertView(list: SavedView[], name: string, query: string): SavedView[] {
  const rest = list.filter((v) => v.name.toLowerCase() !== name.toLowerCase());
  return [...rest, { name, query: canonicalQuery(query) }].sort((a, b) => a.name.localeCompare(b.name));
}

export const removeView = (list: SavedView[], name: string) => list.filter((v) => v.name !== name);

export const hrefForView = (basePath: string, query: string) => (query ? `${basePath}?${query}` : basePath);
