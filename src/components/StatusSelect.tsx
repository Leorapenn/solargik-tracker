"use client";

import { useTransition } from "react";
import type { StageStatus } from "@prisma/client";
import { STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";

const STATUS_OPTIONS: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

export function StatusSelect({
  value,
  onChange,
}: {
  value: StageStatus;
  onChange: (status: StageStatus) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const { bg, text } = STATUS_PILL_STYLES[value];

  return (
    <select
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as StageStatus;
        startTransition(() => {
          onChange(next);
        });
      }}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        border: "none",
        borderRadius: 999,
        padding: "0.3rem 1.6rem 0.3rem 0.75rem",
        fontSize: "0.8rem",
        fontWeight: 700,
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.6 : 1,
        backgroundColor: bg,
        color: text,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23000' stroke-opacity='0.4' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.6rem center",
      }}
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
