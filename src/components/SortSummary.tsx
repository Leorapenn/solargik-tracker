import Link from "next/link";
import { removeSortHref, type SortState } from "@/lib/sort";
import { canonicalQuery } from "@/lib/savedViews";
import { SavedViews } from "@/components/SavedViews";
import { NAVY, ROW_DIVIDER, TEXT_MUTED } from "@/lib/theme";

type SearchParams = Record<string, string | string[] | undefined>;

// "Sorted by 1 Status ▲ × 2 Contract value ▼ ×": shows the current sort order and lets any level be
// removed. Shift+click on a column heading adds another level; this line is where that is explained.
export function SortSummary({
  basePath,
  params,
  current,
  labels,
}: {
  basePath: string;
  params: SearchParams;
  current: SortState;
  labels: Record<string, string>;
}) {
  const several = current.length > 1;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: TEXT_MUTED,
        padding: "10px 20px",
        borderBottom: `1px solid ${ROW_DIVIDER}`,
      }}
    >
      <span>Sorted by</span>
      {current.map((s, index) => (
        <span
          key={s.key}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#EFF1F6", borderRadius: 999, padding: "2px 10px", color: NAVY, fontWeight: 600 }}
        >
          {several && <span style={{ opacity: 0.6 }}>{index + 1}</span>}
          {labels[s.key] ?? s.key} {s.dir === "asc" ? "▲" : "▼"}
          {several && (
            <Link href={removeSortHref(basePath, params, s.key, current)} aria-label={`Stop sorting by ${labels[s.key] ?? s.key}`} title="Remove this sort" style={{ color: TEXT_MUTED }}>
              ×
            </Link>
          )}
        </span>
      ))}
      <span>· Shift+click another column heading to sort by more than one</span>
      <SavedViews basePath={basePath} query={canonicalQuery(params)} />
    </div>
  );
}
