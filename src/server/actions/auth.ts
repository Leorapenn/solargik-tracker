"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authConfigured,
  createSessionToken,
} from "@/lib/session";

export type LoginState = { error?: string };

// Only same-site relative paths, so the login redirect can't be used to bounce users elsewhere.
function safeNextPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/projects";
}

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  if (!authConfigured()) {
    return { error: "Login is not configured on this server." };
  }

  const submitted = createHash("sha256").update(String(formData.get("password") ?? "")).digest();
  const expected = createHash("sha256").update(process.env.APP_PASSWORD ?? "").digest();

  if (!timingSafeEqual(submitted, expected)) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // slow down guessing
    return { error: "Incorrect password." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
