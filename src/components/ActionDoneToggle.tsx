"use client";

import { useState, useTransition } from "react";
import { markActionDone } from "@/server/actions/actionItems";
import { NAVY, secondaryButton } from "@/lib/theme";

// Ticks an action item done, or reopens it.
export function ActionDoneToggle({ id, done }: { id: string; done: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        disabled={pending}
        style={{ ...secondaryButton, padding: "4px 12px", fontSize: 13, color: NAVY }}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await markActionDone(id, !done);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Saving…" : done ? "Reopen" : "Mark done"}
      </button>
      {error && (
        <span role="alert" style={{ color: "#8C1D18", fontSize: 12.5 }}>
          {error}
        </span>
      )}
    </span>
  );
}
