import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { sortHref, type SortState } from "@/lib/sort";

type SearchParams = Record<string, string | string[] | undefined>;

type SortProps = {
  sortKey?: string;
  current?: SortState;
  basePath?: string;
  params?: SearchParams;
};

// The clickable column title: sorts the table by this column (click again to reverse). The choice
// lives in the URL, so a sorted view can be shared or bookmarked.
export function SortLink({
  label,
  sortKey,
  current,
  basePath,
  params,
}: SortProps & { label: ReactNode }) {
  if (!sortKey || !current || !basePath) return <>{label}</>;
  const active = current.key === sortKey;
  return (
    <Link
      href={sortHref(basePath, params ?? {}, sortKey, current)}
      title={`Sort by ${typeof label === "string" ? label : "this column"}`}
      style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
    >
      {label}
      <span aria-hidden="true" style={{ fontSize: 10, opacity: active ? 1 : 0.4 }}>
        {active ? (current.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </Link>
  );
}

// A <th> with a sort link (or a plain header when no sortKey is given).
export function SortTh({
  label,
  style,
  ...sort
}: SortProps & { label?: ReactNode; style?: CSSProperties }) {
  const active = sort.current && sort.sortKey && sort.current.key === sort.sortKey;
  return (
    <th style={style} aria-sort={active ? (sort.current!.dir === "asc" ? "ascending" : "descending") : undefined}>
      <SortLink label={label} {...sort} />
    </th>
  );
}
