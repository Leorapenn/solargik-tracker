import type { PhaseName, StageStatus } from "@prisma/client";
import { STATUS_COLORS, STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import { phaseLabel } from "@/lib/phases";
import { BORDER, TEXT_MUTED } from "@/lib/theme";

// Display only: the status is derived from the phase's sub-stages (see
// derivePhaseStatus), so it can't be edited here.
export function PhaseCard({
  name,
  status,
  done,
  total,
}: {
  name: PhaseName;
  status: StageStatus;
  done: number;
  total: number;
}) {
  const color = STATUS_COLORS[status];
  const { bg, text } = STATUS_PILL_STYLES[status];
  const highlighted = status === "IN_PROGRESS" || status === "BLOCKED";

  return (
    <div
      style={{
        border: `1px solid ${highlighted ? color : BORDER}`,
        borderRadius: 8,
        padding: "0.85rem 1rem",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: TEXT_MUTED,
          textTransform: "uppercase",
        }}
      >
        {phaseLabel(name)}
      </div>
      <span
        style={{
          alignSelf: "flex-start",
          background: bg,
          color: text,
          borderRadius: 999,
          padding: "0.3rem 0.75rem",
          fontSize: "0.8rem",
          fontWeight: 700,
        }}
      >
        {STATUS_LABELS[status]}
      </span>
      <div style={{ height: 4, borderRadius: 2, background: "#eee", overflow: "hidden" }}>
        <div style={{ width: total ? `${(done / total) * 100}%` : 0, height: "100%", background: color }} />
      </div>
      <div style={{ fontSize: "0.75rem", color: TEXT_MUTED }}>
        {done} of {total} done
      </div>
    </div>
  );
}
