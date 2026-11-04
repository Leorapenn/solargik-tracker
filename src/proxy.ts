import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STAFF_HOME, staffMayVisit } from "@/lib/roles";
import { SESSION_COOKIE, sessionRole } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/login") return NextResponse.next();
  // Vercel Cron has no login session; the cron route checks its own secret (CRON_SECRET) and fails closed.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();
  // Same for the Inbox intake (an outside agent posting suggestions): it checks INTAKE_TOKEN itself and fails closed.
  if (pathname.startsWith("/api/intake/")) return NextResponse.next();

  const role = await sessionRole(request.cookies.get(SESSION_COOKIE)?.value);
  if (role === "manager") return NextResponse.next();
  if (role === "staff") {
    // staff open the Tasks page and nothing else (every action also checks the role itself: this only keeps the pages closed)
    if (staffMayVisit(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL(STAFF_HOME, request.url), 303);
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  // 303 so a blocked Server Action POST becomes a GET of the login page.
  return NextResponse.redirect(loginUrl, 303);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
