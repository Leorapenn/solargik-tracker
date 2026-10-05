import type { CSSProperties, ReactNode } from "react";
import { SortLink, type SortProps } from "@/components/SortLink";

export { SortLink };

// A <th> with a sort link (or a plain header when no sortKey is given).
export function SortTh({
  label,
  style,
  ...sort
}: SortProps & { label?: ReactNode; style?: CSSProperties }) {
  const position = sort.current && sort.sortKey ? sort.current.findIndex((s) => s.key === sort.sortKey) : -1;
  const ariaSort = position === 0 ? (sort.current![0].dir === "asc" ? "ascending" : "descending") : undefined;
  return (
    <th style={style} aria-sort={ariaSort}>
      <SortLink label={label} {...sort} />
    </th>
  );
}
