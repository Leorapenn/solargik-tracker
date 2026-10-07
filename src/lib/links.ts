// A web link typed or pasted by a person (a SharePoint folder, a file): http(s) only, trimmed, normalised.
// Empty means "no link". Spaces and other characters are percent-encoded by the URL parser.
export function cleanWebLink(raw: string | null | undefined, max = 1000): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = (raw ?? "").trim();
  if (!t) return { ok: true, value: null };
  if (t.length > max) return { ok: false, error: "That link is too long." };
  try {
    const url = new URL(t);
    if (url.protocol === "https:" || url.protocol === "http:") return { ok: true, value: url.toString() };
  } catch {
    /* falls through */
  }
  return { ok: false, error: "A link must be a web address starting with https://" };
}

// The folder of a project in the SharePoint EXECUTION library, from the folder's name,
// e.g. "259 (Revalue, Rignano Flaminio 1, Italy)".
export const SHAREPOINT_EXECUTION_BASE = "https://solargik.sharepoint.com/sites/Projects/Shared Documents/EXECUTION";
export function executionFolderUrl(folderName: string): string {
  return new URL(`${SHAREPOINT_EXECUTION_BASE}/${folderName}`).toString();
}
