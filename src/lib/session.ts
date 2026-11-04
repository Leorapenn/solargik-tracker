// Stateless signed-cookie session for the two-password login. Uses only Web Crypto so it runs in both the proxy and server code.
//
// Two roles: the MANAGER password (APP_PASSWORD) opens everything, as before; the STAFF password (STAFF_PASSWORD) opens only what
// src/lib/roles.ts allows. A manager token is signed with APP_PASSWORD (changing it signs the managers out). A staff token is signed with
// a key made from BOTH passwords, so a staff member can never make a manager token (they do not know APP_PASSWORD) and changing
// STAFF_PASSWORD signs the staff out. Staff access is OFF until STAFF_PASSWORD is set (at least 10 characters, and not the same as
// APP_PASSWORD): with it missing, nobody can log in as staff and every staff token is refused.

export type Role = "manager" | "staff";

export const SESSION_COOKIE = "solargik_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MIN_PASSWORD_LENGTH = 10;

const encoder = new TextEncoder();

export function authConfigured(): boolean {
  const password = process.env.APP_PASSWORD;
  return !!password && password.length >= MIN_PASSWORD_LENGTH;
}

// Staff login exists only when the manager login does, STAFF_PASSWORD is long enough and it is a different password.
export function staffConfigured(): boolean {
  const staff = process.env.STAFF_PASSWORD;
  return authConfigured() && !!staff && staff.length >= MIN_PASSWORD_LENGTH && staff !== process.env.APP_PASSWORD;
}

async function hmacKey(role: Role, usage: KeyUsage[]) {
  const secret = role === "staff" ? `${process.env.APP_PASSWORD ?? ""}\u0000staff\u0000${process.env.STAFF_PASSWORD ?? ""}` : (process.env.APP_PASSWORD ?? "");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);
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

// "v1" tokens are the managers' (as they always were, so nobody is signed out when staff access arrives); "v2s" tokens are staff's.
const PREFIX: Record<Role, string> = { manager: "v1", staff: "v2s" };

export async function createSessionToken(role: Role = "manager"): Promise<string> {
  if (role === "staff" && !staffConfigured()) throw new Error("Staff login is not configured.");
  const payload = `${PREFIX[role]}.${Date.now() + SESSION_MAX_AGE_SECONDS * 1000}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(role, ["sign"]), encoder.encode(payload));
  return `${payload}.${toHex(signature)}`;
}

// The role a token proves, or null (missing, malformed, expired, wrongly signed, or a staff token while staff access is off).
export async function sessionRole(token: string | null | undefined): Promise<Role | null> {
  if (!token || !authConfigured()) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const role = (Object.keys(PREFIX) as Role[]).find((r) => PREFIX[r] === parts[0]);
  if (!role) return null;
  if (role === "staff" && !staffConfigured()) return null;

  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const signature = fromHex(parts[2]);
  if (!signature) return null;

  const ok = await crypto.subtle.verify("HMAC", await hmacKey(role, ["verify"]), signature, encoder.encode(`${parts[0]}.${parts[1]}`));
  return ok ? role : null;
}

// True only for a manager's token (what "signed in" meant before there were roles).
export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  return (await sessionRole(token)) === "manager";
}
