import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_HOME } from "@/lib/roles";
import { SESSION_COOKIE, sessionRole, type Role } from "@/lib/session";

// Who is signed in: "manager", "staff" or null. See src/lib/session.ts and src/lib/roles.ts.
export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  return sessionRole(jar.get(SESSION_COOKIE)?.value);
}

// Everything is MANAGER-ONLY unless it says otherwise: a page, route or action that calls the plain functions below refuses staff.
// The proxy already redirects the signed-out; these re-check next to the data so a proxy matcher mistake can't expose anything.
export async function requirePageAuth() {
  const role = await currentRole();
  if (role === "staff") redirect(STAFF_HOME);
  if (role !== "manager") redirect("/login");
}

// For the few pages staff may open too (the Tasks page): returns the role.
export async function requireAnyPageAuth(): Promise<Role> {
  const role = await currentRole();
  if (!role) redirect("/login");
  return role;
}

// For route handlers (file downloads, exports), which answer 401 themselves instead of redirecting. Managers only.
export async function hasSession(): Promise<boolean> {
  return (await currentRole()) === "manager";
}

// Server Actions: managers only.
export async function requireActionAuth() {
  if ((await currentRole()) !== "manager") throw new Error("Unauthorized");
}

// The few Server Actions staff may run too (marking a task done, adding an update, changing a date: see src/server/actions/tasks.ts).
// A test lists them, so one cannot be added by accident.
export async function requireStaffAction(): Promise<Role> {
  const role = await currentRole();
  if (!role) throw new Error("Unauthorized");
  return role;
}
