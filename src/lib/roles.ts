// What each role may open. Managers: everything. Staff: the Tasks page (where they mark their tasks done, add an update or
// change a date; src/server/actions/tasks.ts lists the few actions they may run, and every other action refuses them) and the
// read-only department Overview (quick numbers and bars: no money, contracts or files).
// Everything not listed here is closed to staff: a new page is manager-only until it is added on purpose.

// Staff may open exactly these addresses (with their filters in the query), nothing under them.
export const STAFF_PATHS = ["/tasks", "/overview"] as const;

export const STAFF_HOME = "/tasks";

export function staffMayVisit(pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (STAFF_PATHS as readonly string[]).includes(clean);
}

// Where a staff member lands after signing in: the page they asked for if staff may open it, else the Tasks page.
export function staffLanding(next: string): string {
  const path = next.split("?")[0].split("#")[0];
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && staffMayVisit(path) ? next : STAFF_HOME;
}
