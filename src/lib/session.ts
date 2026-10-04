// Stateless signed-cookie session for the shared-password login. Uses only Web
// Crypto so it runs in both the proxy and server code. The signing key is
// APP_PASSWORD itself, so changing the password signs everyone out.

export const SESSION_COOKIE = "solargik_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MIN_PASSWORD_LENGTH = 10;

const encoder = new TextEncoder();

export function authConfigured(): boolean {
  const password = process.env.APP_PASSWORD;
  return !!password && password.length >= MIN_PASSWORD_LENGTH;
}

async function hmacKey(usage: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.APP_PASSWORD ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function createSessionToken(): Promise<string> {
  const payload = `v1.${Date.now() + SESSION_MAX_AGE_SECONDS * 1000}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(["sign"]), encoder.encode(payload));
  return `${payload}.${toHex(signature)}`;
}

export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token || !authConfigured()) return false;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const signature = fromHex(parts[2]);
  if (!signature) return false;

  return crypto.subtle.verify("HMAC", await hmacKey(["verify"]), signature, encoder.encode(`v1.${parts[1]}`));
}
