"use client";

import { useState, useTransition } from "react";
import { emailUpdates } from "@/server/actions/weeklyEmail";
import { secondaryButton } from "@/lib/theme";

// Sends the shown period by email right now (the weekly Sunday email does the same for last week).
export function EmailUpdatesButton({ from, to }: { from: string; to: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
      <button
        type="button"
        style={secondaryButton}
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await emailUpdates(from, to);
            setMessage(result.ok ? { ok: true, text: "Email sent." } : { ok: false, text: result.error });
          });
        }}
      >
        {pending ? "Sending…" : "Email me this"}
      </button>
      {message && (
        <span role="status" style={{ fontSize: 13, color: message.ok ? "#047857" : "#8C1D18" }}>
          {message.text}
        </span>
      )}
    </span>
  );
}
