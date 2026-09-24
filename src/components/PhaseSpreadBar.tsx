import type { StageStatus } from "@prisma/client";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/statusColors";

export function PhaseSpreadBar({ statuses }: { statuses: { label: string; status: StageStatus }[] }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {statuses.map(({ label, status }) => (
        <span
          key={label}
          title={`${label}: ${STATUS_LABELS[status]}`}
          style={{
            display: "inline-block",
            width: 18,
            height: 6,
            borderRadius: 3,
            backgroundColor: STATUS_COLORS[status],
          }}
        />
      ))}
    </div>
  );
}
