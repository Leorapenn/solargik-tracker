import type { PhaseName, StageStatus } from "@prisma/client";
import { StatusSelect } from "./StatusSelect";
import { STATUS_COLORS } from "@/lib/statusColors";
import { BORDER, TEXT_MUTED } from "@/lib/theme";

const PROGRESS_FRACTION: Record<StageStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 0.5,
  BLOCKED: 0.5,
  DONE: 1,
};

export function PhaseCard({
  index,
  name,
  status,
  onChange,
}: {
  index: number;
  name: PhaseName;
  status: StageStatus;
  onChange: (status: StageStatus) => Promise<void>;
}) {
  const color = STATUS_COLORS[status];
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
        {String(index).padStart(2, "0")} {name.replace("_", " ")}
      </div>
      <StatusSelect value={status} onChange={onChange} />
      <div style={{ height: 4, borderRadius: 2, background: "#eee", overflow: "hidden" }}>
        <div style={{ width: `${PROGRESS_FRACTION[status] * 100}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}
