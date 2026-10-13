// Uploaded files (invoices, payslips, change orders, contracts). The file itself lives in a PRIVATE Vercel Blob store;
// what is saved next to a record is only our own link to it, "/api/files/<name>", which the site serves to a logged-in
// person (never a public address). These helpers are pure so they can be tested and used on the page and the server.

// How the site talks to the private store: "token" = a read-write token (BLOB_READ_WRITE_TOKEN), "oidc" = Vercel's
// keyless connection (BLOB_STORE_ID + BLOB_WEBHOOK_PUBLIC_KEY, which is what a newly linked store uses), null = not connected.
export type UploadMode = "token" | "oidc" | null;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
const EXTENSION_TYPES: Record<string, (typeof ALLOWED_UPLOAD_TYPES)[number]> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
export const UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg";
export const UPLOAD_RULES_TEXT = "PDF, PNG or JPG, up to 10 MB";

// Where files go inside the store, and the address the site serves them from.
export const BLOB_FOLDER = "uploads/";
export const FILE_ROUTE_PREFIX = "/api/files/";

// One file name only: letters, digits and . _ ( ) -, never a path, never "." or "..".
const STORED_NAME = /^[A-Za-z0-9][A-Za-z0-9._()-]{0,199}$/;

// A file name made safe to store: only the characters above, no path, with a known extension kept.
export function safeFileName(original: string): string {
  // split the extension off the ORIGINAL name, so a name with no Latin letters ("חשבונית.pdf") keeps ".pdf"
  const base = (original.split(/[\\/]/).pop() ?? "").normalize("NFKD");
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .replace(/[^A-Za-z0-9._()-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 80);
  return `${stem || "file"}${ext ? `.${ext}` : ""}`;
}

export type UploadCheck = { ok: true; contentType: (typeof ALLOWED_UPLOAD_TYPES)[number] } | { ok: false; error: string };

// The checks a person's file must pass before it is sent: a known type (by extension and, when the browser says, by
// type) and at most 10 MB. The server checks the same again when it issues the upload permission.
export function checkUpload(file: { name: string; size: number; type?: string }): UploadCheck {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const byExtension = EXTENSION_TYPES[ext];
  if (!byExtension) return { ok: false, error: `Only ${UPLOAD_RULES_TEXT}.` };
  if (file.type && !(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) return { ok: false, error: `Only ${UPLOAD_RULES_TEXT}.` };
  if (file.size <= 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That file is larger than 10 MB." };
  return { ok: true, contentType: byExtension };
}

// The pathname the browser asks to upload to: "uploads/<safe name>" with a random suffix before the extension, so two
// files with the same name never collide (the store also refuses to overwrite). `suffix` is random hex from the caller.
export function uploadPathnameFor(originalName: string, suffix: string): string {
  const name = safeFileName(originalName);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return `${BLOB_FOLDER}${stem}-${suffix}${ext}`;
}

// The name inside the store for a stored file name, or null when it isn't a name we could have stored.
export function blobPathname(storedName: string): string | null {
  return STORED_NAME.test(storedName) && storedName !== "." && storedName !== ".." ? `${BLOB_FOLDER}${storedName}` : null;
}

// The pathname the browser asks permission for: exactly "uploads/<safe name>", nothing else.
export function isUploadPathname(pathname: string): boolean {
  return pathname.startsWith(BLOB_FOLDER) && blobPathname(pathname.slice(BLOB_FOLDER.length)) === pathname;
}

// The link saved on a record, from the pathname the store returned ("uploads/<name>").
export function ownFileLink(pathname: string): string | null {
  return isUploadPathname(pathname) ? `${FILE_ROUTE_PREFIX}${pathname.slice(BLOB_FOLDER.length)}` : null;
}

// True for exactly the links ownFileLink makes (an address on this site, not an outside one).
export function isOwnFileLink(link: string): boolean {
  return link.startsWith(FILE_ROUTE_PREFIX) && blobPathname(link.slice(FILE_ROUTE_PREFIX.length)) !== null;
}

// The validation of a file link typed, pasted or uploaded: our own upload link, or a web address (https:// or http://).
export function cleanFileLink(raw: unknown, messages: { tooLong: string; invalid: string }): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = (typeof raw === "string" ? raw : "").trim();
  if (!t) return { ok: true, value: null };
  if (t.length > 1000) return { ok: false, error: messages.tooLong };
  if (isOwnFileLink(t)) return { ok: true, value: t };
  try {
    const url = new URL(t);
    if (url.protocol === "https:" || url.protocol === "http:") return { ok: true, value: url.toString() };
  } catch {
    /* falls through */
  }
  return { ok: false, error: messages.invalid };
}

// The content type the site answers with: only the three allowed types, else a plain download.
export function servedContentType(stored: string | undefined): string {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(stored ?? "") ? (stored as string) : "application/octet-stream";
}
