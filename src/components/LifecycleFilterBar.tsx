import Link from "next/link";
import type { ProjectLifecycle } from "@prisma/client";
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER } from "@/lib/lifecycle";
import { hrefWith } from "@/lib/sort";
import { BORDER, NAVY } from "@/lib/theme";

type SearchParams = Record<string, string | string[] | undefined>;

// The All / Active / Pre-NTP / On hold / Suspended / Cancelled chips. The same bar is used on the
// Projects tab and on a customer's page; the current sort is kept when a chip is clicked.
export function LifecycleFilterBar({
  basePath,
  params,
  filter,
  counts,
  total,
}: {
  basePath: string;
  params: SearchParams;
  filter: ProjectLifecycle | null;
  counts: Record<ProjectLifecycle, number>;
  total: number;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Filter by project status">
      <Chip href={hrefWith(basePath, params, { lifecycle: undefined })} active={!filter} label={`All (${total})`} />
      {LIFECYCLE_ORDER.map((lifecycle) => (
        <Chip
          key={lifecycle}
          href={hrefWith(basePath, params, { lifecycle })}
          active={filter === lifecycle}
          label={`${LIFECYCLE_LABELS[lifecycle]} (${counts[lifecycle]})`}
        />
      ))}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        border: `1px solid ${active ? NAVY : BORDER}`,
        background: active ? NAVY : "#fff",
        color: active ? "#fff" : NAVY,
      }}
    >
      {label}
    </Link>
  );
}
