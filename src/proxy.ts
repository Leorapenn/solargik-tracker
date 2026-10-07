import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/login") return NextResponse.next();
  // Vercel Cron has no login session; the cron route checks its own secret (CRON_SECRET) and fails closed.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();

  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  // 303 so a blocked Server Action POST becomes a GET of the login page.
  return NextResponse.redirect(loginUrl, 303);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
