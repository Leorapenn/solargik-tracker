// Whether the private file store is connected (Vercel sets BLOB_READ_WRITE_TOKEN when a Blob store is linked to the
// project). Until then the Upload buttons are shown disabled and the upload route answers 503.
export function uploadsConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
