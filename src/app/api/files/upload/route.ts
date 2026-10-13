import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { hasSession } from "@/lib/auth";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, isUploadPathname } from "@/lib/uploads";
import { uploadsConfigured } from "@/server/uploads";

// Gives a logged-in person's browser permission to send ONE file straight to the private store (the file doesn't pass
// through this server, so it can be larger than a request body is allowed to be). The permission is for one pathname
// of the form "uploads/<safe name>", only the allowed types, at most 10 MB, and never overwrites an existing file.
// Nothing is saved on a record here: the record only gets our own link when the person presses Save.
export async function POST(request: Request) {
  if (!(await hasSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!uploadsConfigured()) return NextResponse.json({ error: "File uploads are not set up yet." }, { status: 503 });

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isUploadPathname(pathname)) throw new Error("That file name is not allowed.");
        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "The upload was not allowed." }, { status: 400 });
  }
}
