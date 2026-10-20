// Which customers and tasks are folded on the Tasks tab, remembered per browser (localStorage; nothing in the database).
// The stored value is a JSON list of ids like "group:<customerId>" and "task:<taskId>". These helpers only turn that text
// into a list and back, so a damaged value just means everything is open.

export const FOLD_STORAGE_KEY = "solargik.tasks.folded";
const MAX_IDS = 500; // old ids of deleted tasks drop off the front

export function parseFolded(raw: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-MAX_IDS) : [];
  } catch {
    return [];
  }
}

// The stored text after folding (folded = true) or opening (false) one id.
export function withFolded(raw: string | null | undefined, id: string, folded: boolean): string {
  const ids = parseFolded(raw).filter((x) => x !== id);
  if (folded) ids.push(id);
  return JSON.stringify(ids.slice(-MAX_IDS));
}