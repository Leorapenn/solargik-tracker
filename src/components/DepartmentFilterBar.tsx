import Link from "next/link";
import type { Department } from "@prisma/client";
import { DEPARTMENTS, departmentLabel } from "@/lib/departments";
import { departmentsParam, toggleDepartment } from "@/lib/departmentFilter";
import { hrefWith } from "@/lib/sort";
import { BORDER, NAVY, TEXT_MUTED } from "@/lib/theme";

type SearchParams = Record<string, string | string[] | undefined>;

// "Show only these departments' items": tick one or several. Keeps the current sort and other filters.
export function DepartmentFilterBar({
  basePath,
  params,
  selected,
}: {
  basePath: string;
  params: SearchParams;
  selected: Department[];
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} role="group" aria-label="Filter by department">
      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Department</span>
      <Chip href={hrefWith(basePath, params, { dept: undefined })} active={selected.length === 0} label="All" />
      {DEPARTMENTS.map((department) => (
        <Chip
          key={department}
          href={hrefWith(basePath, params, { dept: departmentsParam(toggleDepartment(selected, department)) })}
          active={selected.includes(department)}
          label={departmentLabel(department)}
        />
      ))}
      {selected.length > 0 && (
        <span style={{ fontSize: 12.5, color: TEXT_MUTED }}>Only items belonging to the chosen departments are shown and counted.</span>
      )}
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      style={{
        padding: "6px 13px",
        borderRadius: 999,
        fontSize: 13.5,
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
