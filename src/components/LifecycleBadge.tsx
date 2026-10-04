import type { ProjectLifecycle } from "@prisma/client";
import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from "@/lib/lifecycle";

export function LifecycleBadge({
  lifecycle,
  stage,
  status,
}: {
  lifecycle: ProjectLifecycle;
  stage?: string | null;
  status?: string | null;
}) {
  const { bg, text } = LIFECYCLE_STYLES[lifecycle];
  const source = [stage && `Stage: ${stage}`, status && `Status: ${status}`].filter(Boolean).join(" · ");

  return (
    <span
      title={source ? `From monday.com — ${source}` : undefined}
      style={{
        display: "inline-block",
        background: bg,
        color: text,
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}
