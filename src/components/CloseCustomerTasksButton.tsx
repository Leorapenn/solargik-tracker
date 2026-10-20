"use client";

import { useState, useTransition } from "react";
import { closeAllCustomerTasks } from "@/server/actions/tasks";
import { secondaryButton } from "@/lib/theme";

// "Close all N": resolves every open task of one customer after a confirmation.
export function CloseCustomerTasksButton({ customerId, customerName, openCount }: { customerId: string; customerName: string; openCount: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (openCount === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        disabled={pending}
        style={{ ...secondaryButton, padding: "3px 12px", fontSize: 13 }}
        title={`Mark every open task of ${customerName} as resolved`}
        onClick={() => {
          if (!window.confirm(`Close all ${openCount} open task${openCount === 1 ? "" : "s"} of ${customerName}? Each is marked Resolved and its follow-up date is cleared.`)) return;
          setError(null);
          startTransition(async () => {
            const r = await closeAllCustomerTasks(customerId);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        {pending ? "Closing…" : `Close all ${openCount}`}
      </button>
      {error && (
        <span role="alert" style={{ color: "#8C1D18", fontSize: 13 }}>
          {error}
        </span>
      )}
    </span>
  );
}