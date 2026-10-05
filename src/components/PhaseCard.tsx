import type { PhaseName, StageStatus } from "@prisma/client";
import { STATUS_COLORS, STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import { phaseLabel } from "@/lib/phases";
import { formatDate } from "@/lib/dates";
import type { PhaseRollup } from "@/lib/phaseRollup";
import { BORDER, TEXT_MUTED } from "@/lib/theme";

// Display only: the status is derived from the phase's sub-stages (see derivePhaseStatus), and the
// dates and owners are rolled up from them, so none of it is edited here.
export function PhaseCard({
  name,
  status,
  rollup,
}: {
  name: PhaseName;
  status: StageStatus;
  rollup: PhaseRollup;
}) {
  const color = STATUS_COLORS[status];
  const { bg, text } = STATUS_PILL_STYLES[status];
  const highlighted = status === "IN_PROGRESS" || status === "BLOCKED";
  const small = { fontSize: "0.75rem", color: TEXT_MUTED } as const;

  return (
    <div
      style={{
        border: `1px solid ${highlighted ? color : BORDER}`,
        borderRadius: 8,
        padding: "0.85rem 1rem",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
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
        <div
          style={{ width: rollup.total ? `${(rollup.done / rollup.total) * 100}%` : 0, height: "100%", background: color }}
        />
      </div>
      <div style={small}>
        {rollup.done} of {rollup.total} done
      </div>
      {rollup.completedAt ? (
        <div style={small}>Completed {formatDate(rollup.completedAt)}</div>
      ) : (
        rollup.startedAt && <div style={small}>Started {formatDate(rollup.startedAt)}</div>
      )}
      {rollup.targetDate && (
        <div style={{ ...small, color: rollup.overdueSince ? "#B3261E" : TEXT_MUTED, fontWeight: rollup.overdueSince ? 600 : 400 }}>
          Due {formatDate(rollup.targetDate)}
          {rollup.overdueSince ? " · overdue items" : ""}
        </div>
      )}
      {rollup.doneWithoutDate > 0 && (
        <div style={{ ...small, color: "#9A4B00", fontWeight: 600 }}>
          ⚠ {rollup.doneWithoutDate} done item{rollup.doneWithoutDate === 1 ? "" : "s"} without a date
        </div>
      )}
      <div style={small}>{rollup.owners.length ? `Owner${rollup.owners.length > 1 ? "s" : ""}: ${rollup.owners.join(", ")}` : "No owner assigned"}</div>
    </div>
  );
}
