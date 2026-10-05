"use client";

import { useState, useTransition } from "react";
import type { ProjectLifecycle } from "@prisma/client";
import { setProjectLifecycle } from "@/server/actions/edit";
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER, LIFECYCLE_STYLES } from "@/lib/lifecycle";
import { isLocked } from "@/lib/lockable";

// The project's status as a dropdown, so it can be corrected right where it is shown. A change is kept
// (monday.com imports won't overwrite it); the editor's "Use monday.com's value again" undoes that.
export function ProjectStatusSelect({
  projectId,
  projectName,
  value,
  lockedFields,
  mondayStage,
  mondayStatus,
}: {
  projectId: string;
  projectName: string;
  value: ProjectLifecycle;
  lockedFields: string[];
  mondayStage?: string | null;
  mondayStatus?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { bg, text } = LIFECYCLE_STYLES[value];
  const source = [mondayStage && `Stage: ${mondayStage}`, mondayStatus && `Status: ${mondayStatus}`].filter(Boolean).join(" · ");
  const title = [
    isLocked(lockedFields, "lifecycle") ? "Set by hand: monday.com imports won't change it." : source ? `From monday.com: ${source}` : "",
    "Click to change the status.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <select
        aria-label={`Status of ${projectName}`}
        title={title}
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as ProjectLifecycle;
          setError(null);
          startTransition(async () => {
            const result = await setProjectLifecycle(projectId, next);
            if (!result.ok) setError(result.error);
          });
        }}
        style={{
          border: "none",
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
          background: bg,
          color: text,
        }}
      >
        {LIFECYCLE_ORDER.map((lifecycle) => (
          <option key={lifecycle} value={lifecycle} style={{ color: "#333", background: "#fff" }}>
            {LIFECYCLE_LABELS[lifecycle]}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" style={{ fontSize: 12, color: "#8C1D18" }}>
          {error}
        </span>
      )}
    </span>
  );
}
