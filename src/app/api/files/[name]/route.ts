import { get } from "@vercel/blob";
import { hasSession } from "@/lib/auth";
import { blobPathname, servedContentType } from "@/lib/uploads";
import { uploadsConfigured } from "@/server/uploads";

// Serves an uploaded file to a logged-in person only. The store is private, so there is no address that works
// without this check. Only "uploads/<name>" files can be asked for; the answer is never cached by shared caches.
export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  if (!(await hasSession())) return new Response("Unauthorized", { status: 401 });
  if (!uploadsConfigured()) return new Response("File uploads are not set up yet.", { status: 503 });

  const { name } = await context.params;
  const pathname = blobPathname(name);
  if (!pathname) return new Response("Not found", { status: 404 });

  let found;
  try {
    found = await get(pathname, { access: "private" });
  } catch {
    return new Response("Could not read the file.", { status: 502 });
  }
  if (!found || found.statusCode !== 200) return new Response("Not found", { status: 404 });

  const type = servedContentType(found.blob.contentType);
  return new Response(found.stream, {
    headers: {
      "Content-Type": type,
      // shown in the browser for the three allowed types; the name is the stored, already-safe one
      "Content-Disposition": `inline; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
