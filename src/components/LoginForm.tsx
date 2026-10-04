"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/server/actions/auth";
import { BORDER, NAVY } from "@/lib/theme";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <input type="hidden" name="next" value={next} />
      <label style={{ fontSize: "0.8rem", fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Password
      </label>
      <input
        type="password"
        name="password"
        autoFocus
        required
        autoComplete="current-password"
        style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "0.6rem 0.75rem", fontSize: "1rem" }}
      />
      {state.error && <span style={{ color: "#B91C3C", fontSize: "0.9rem" }}>{state.error}</span>}
      <button
        type="submit"
        disabled={isPending}
        style={{
          backgroundColor: NAVY,
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "0.65rem 0.75rem",
          fontSize: "0.95rem",
          fontWeight: 700,
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
