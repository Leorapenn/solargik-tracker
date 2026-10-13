import type { UploadMode } from "@/lib/uploads";

// How the private file store is connected. Vercel sets BLOB_READ_WRITE_TOKEN for a token connection, or BLOB_STORE_ID
// and BLOB_WEBHOOK_PUBLIC_KEY for the keyless (OIDC) connection a newly linked store uses. Until one of them is there the
// Upload buttons are shown disabled and the routes answer 503.
export function uploadMode(): UploadMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "token";
  if (process.env.BLOB_STORE_ID && process.env.BLOB_WEBHOOK_PUBLIC_KEY) return "oidc";
  return null;
}

export function uploadsConfigured(): boolean {
  return uploadMode() !== null;
}
