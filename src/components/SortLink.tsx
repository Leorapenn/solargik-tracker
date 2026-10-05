"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sortHref, type SortState } from "@/lib/sort";

type SearchParams = Record<string, string | string[] | undefined>;

export type SortProps = {
  sortKey?: string;
  current?: SortState;
  basePath?: string;
  params?: SearchParams;
};

// The clickable column title. A plain click sorts by this column alone (click again to reverse);
// Shift+click (or Ctrl/Cmd+click) adds it as a further sort, so ties in the first column are
// ordered by the next. The sort lives in the URL, so a sorted view can be shared or bookmarked.
export function SortLink({ label, sortKey, current, basePath, params }: SortProps & { label: ReactNode }) {
  const router = useRouter();
  if (!sortKey || !current || !basePath) return <>{label}</>;

  const position = current.findIndex((s) => s.key === sortKey);
  const active = position >= 0;
  const dir = active ? current[position].dir : null;
  const replaceHref = sortHref(basePath, params ?? {}, sortKey, current, "replace");
  const addHref = sortHref(basePath, params ?? {}, sortKey, current, "add");
  const name = typeof label === "string" ? label : "this column";

  return (
    <Link
      href={replaceHref}
      title={`Sort by ${name}. Shift+click to add it as a further sort.`}
      onClick={(event) => {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          event.preventDefault();
          router.push(addHref);
        }
      }}
      style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
    >
      {label}
      <span aria-hidden="true" style={{ fontSize: 10, opacity: active ? 1 : 0.4, display: "inline-flex", gap: 3 }}>
        {active && current.length > 1 && (
          <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 8, padding: "0 5px", fontWeight: 700 }}>{position + 1}</span>
        )}
        {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </Link>
  );
}
