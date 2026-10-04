import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

// The proxy already redirects unauthenticated requests; these re-check next
// to the data so a proxy matcher mistake can't expose anything.
export async function requirePageAuth() {
  if (!(await isAuthenticated())) redirect("/login");
}

export async function requireActionAuth() {
  if (!(await isAuthenticated())) throw new Error("Unauthorized");
}
