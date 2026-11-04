"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { staffLanding } from "@/lib/roles";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authConfigured,
  createSessionToken,
  staffConfigured,
  type Role,
} from "@/lib/session";

export type LoginState = { error?: string };

// Only same-site relative paths, so the login redirect can't be used to bounce users elsewhere.
function safeNextPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/customers";
}

const sameSecret = (submitted: string, expected: string) =>
  timingSafeEqual(createHash("sha256").update(submitted).digest(), createHash("sha256").update(expected).digest());

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  if (!authConfigured()) {
    return { error: "Login is not configured on this server." };
  }

  // Both passwords are always compared (so the time taken says nothing about which one was close). The manager password wins.
  const submitted = String(formData.get("password") ?? "");
  const isManager = sameSecret(submitted, process.env.APP_PASSWORD ?? "");
  const isStaff = staffConfigured() && sameSecret(submitted, process.env.STAFF_PASSWORD ?? "");
  const role: Role | null = isManager ? "manager" : isStaff ? "staff" : null;

  if (!role) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // slow down guessing
    return { error: "Incorrect password." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const next = String(formData.get("next") ?? "");
  redirect(role === "staff" ? staffLanding(next) : safeNextPath(next));
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
