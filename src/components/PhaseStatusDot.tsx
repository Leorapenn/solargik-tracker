import type { StageStatus } from "@prisma/client";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/statusColors";

export function PhaseStatusDot({ label, status }: { label: string; status: StageStatus }) {
  return (
    <span
      title={`${label}: ${STATUS_LABELS[status]}`}
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: STATUS_COLORS[status],
      }}
    />
  );
}
