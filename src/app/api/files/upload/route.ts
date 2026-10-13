import { NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUpload, handleUploadPresigned, type HandleUploadBody } from "@vercel/blob/client";
import { hasSession } from "@/lib/auth";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, isUploadPathname } from "@/lib/uploads";
import { uploadMode } from "@/server/uploads";

// Gives a logged-in person's browser permission to send ONE file straight to the private store (the file doesn't pass
// through this server, so it can be larger than a request body is allowed to be). The permission is for one pathname
// of the form "uploads/<safe name>", only the allowed types, at most 10 MB, and never overwrites an existing file.
// Nothing is saved on a record here: the record only gets our own link when the person presses Save.
// Two ways to ask, by what the browser sends: a client token (read-write token connection) or a presigned address
// (keyless connection); the checks are the same.
export async function POST(request: Request) {
  if (!(await hasSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mode = uploadMode();
  if (!mode) return NextResponse.json({ error: "File uploads are not set up yet." }, { status: 503 });

  let body: { type?: string };
  try {
    body = (await request.json()) as { type?: string };
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    if (body.type === "blob.generate-presigned-url") {
      if (mode !== "oidc") throw new Error("wrong connection");
      const result = await handleUploadPresigned({
        body: body as Parameters<typeof handleUploadPresigned>[0]["body"],
        request,
        getSignedToken: async (pathname) => {
          if (!isUploadPathname(pathname)) throw new Error("That file name is not allowed.");
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            allowedContentTypes: [...ALLOWED_UPLOAD_TYPES],
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            validUntil: Date.now() + 15 * 60 * 1000,
          });
          return { token, urlOptions: { allowedContentTypes: [...ALLOWED_UPLOAD_TYPES], maximumSizeInBytes: MAX_UPLOAD_BYTES, allowOverwrite: false, addRandomSuffix: false } };
        },
      });
      return NextResponse.json(result);
    }

    if (mode !== "token") throw new Error("wrong connection");
    const result = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isUploadPathname(pathname)) throw new Error("That file name is not allowed.");
        return { allowedContentTypes: [...ALLOWED_UPLOAD_TYPES], maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: false, allowOverwrite: false };
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "The upload was not allowed." }, { status: 400 });
  }
}
