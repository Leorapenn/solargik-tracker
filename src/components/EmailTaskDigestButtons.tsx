"use client";

import { useState, useTransition } from "react";
import { emailMyTaskDigest } from "@/server/actions/taskDigest";
import { secondaryButton } from "@/lib/theme";

// Sends YOU a test of today's or this week's task email (only to the fallback address, never to the owners).
export function EmailTaskDigestButtons() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const send = (kind: "daily" | "weekly") => {
    setMessage(null);
    startTransition(async () => {
      const result = await emailMyTaskDigest(kind);
      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
    });
  };
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" style={secondaryButton} disabled={pending} onClick={() => send("daily")}>
        {pending ? "Sending…" : "Email me today's tasks"}
      </button>
      <button type="button" style={secondaryButton} disabled={pending} onClick={() => send("weekly")}>
        Email me this week
      </button>
      {message && (
        <span role="status" style={{ fontSize: 13, color: message.ok ? "#047857" : "#8C1D18" }}>
          {message.text}
        </span>
      )}
    </span>
  );
}
