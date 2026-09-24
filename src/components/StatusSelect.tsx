"use client";

import { useTransition } from "react";
import type { StageStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/statusColors";

const STATUS_OPTIONS: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

export function StatusSelect({
  value,
  onChange,
}: {
  value: StageStatus;
  onChange: (status: StageStatus) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

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
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
