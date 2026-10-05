"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, departmentLabel } from "@/lib/departments";
import { PHASE_ORDER, phaseLabel } from "@/lib/phases";
import { STATUS_LABELS } from "@/lib/statusColors";
import { hrefWith } from "@/lib/sort";
import {
  DATE_MODES_FOR,
  DATE_MODE_LABELS,
  FILTER_LABELS,
  FILTER_ORDER,
  UNASSIGNED,
  activeFilterKeys,
  describeFilter,
  filterValue,
  parseRowFilters,
  type FilterKey,
} from "@/lib/rowFilters";
import { BORDER, NAVY, TEXT_MUTED, inputStyle, secondaryButton } from "@/lib/theme";
import type { StageStatus } from "@prisma/client";

type Params = Record<string, string | string[] | undefined>;
type Option = { value: string; label: string };

const STATUSES: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

// "+ Filter": pick any column of the items table and choose which values to show. Active filters appear as
// chips (click one to change it, x to remove it). Everything is kept in the URL, so it combines with sorting
// and can be saved as one of "My views".
export function ColumnFilters({
  basePath,
  params,
  people,
  shown,
  total,
}: {
  basePath: string;
  params: Params;
  people: { id: string; name: string }[];
  shown: number;
  total: number;
}) {
  const router = useRouter();
  const filters = parseRowFilters(params);
  const active = activeFilterKeys(filters);
  const ownerNames = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const [open, setOpen] = useState<FilterKey | "menu" | null>(null);
  const [text, setText] = useState(filters.q);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const options = (key: FilterKey): Option[] => {
    if (key === "phase") return PHASE_ORDER.map((p) => ({ value: p, label: phaseLabel(p) }));
    if (key === "dept") return DEPARTMENTS.map((d) => ({ value: d, label: departmentLabel(d) }));
    if (key === "status") return STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));
    if (key === "owner") return [{ value: UNASSIGNED, label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))];
    if (key === "q") return [];
    return DATE_MODES_FOR[key].map((m) => ({ value: m, label: DATE_MODE_LABELS[m] }));
  };

  const go = (changes: Partial<Record<FilterKey, string | undefined>>) =>
    router.push(hrefWith(basePath, params, changes as Record<string, string | undefined>));
  const setValues = (key: FilterKey, values: string[]) => go({ [key]: values.length ? values.join(",") : undefined });
  const clearAll = () => go(Object.fromEntries(FILTER_ORDER.map((k) => [k, undefined])));

  const chip = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "#EFF1F6",
    color: NAVY,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: "4px 6px 4px 12px",
    fontSize: 13,
    fontWeight: 600,
  } as const;
  const popover = {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 30,
    minWidth: 220,
    maxHeight: 340,
    overflowY: "auto",
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(20,42,92,0.18)",
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } as const;

  function picker(key: FilterKey) {
    if (key === "q") {
      return (
        <form
          style={{ display: "flex", gap: 6, padding: 4 }}
          onSubmit={(event) => {
            event.preventDefault();
            setValues("q", text.trim() ? [text.trim()] : []);
            setOpen(null);
          }}
        >
          <input
            aria-label="Sub-stage name contains"
            placeholder="Name contains…"
            autoFocus
            value={text}
            maxLength={80}
            onChange={(event) => setText(event.target.value)}
            style={{ ...inputStyle, width: 170 }}
          />
          <button type="submit" style={{ ...secondaryButton, padding: "6px 12px" }}>
            Apply
          </button>
        </form>
      );
    }
    const chosen = filterValue(filters, key);
    return options(key).map((option) => (
      <label key={option.value} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#333" }}>
        <input
          type="checkbox"
          checked={chosen.includes(option.value)}
          onChange={(event) =>
            setValues(key, event.target.checked ? [...chosen, option.value] : chosen.filter((v) => v !== option.value))
          }
        />
        {option.label}
      </label>
    ));
  }

  return (
    <div ref={root} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flex: "1 1 auto" }} role="group" aria-label="Filter the items">
      <div style={{ position: "relative" }}>
        <button
          type="button"
          style={secondaryButton}
          aria-haspopup="menu"
          aria-expanded={open === "menu"}
          onClick={() => setOpen(open === "menu" ? null : "menu")}
        >
          + Filter
        </button>
        {open === "menu" && (
          <div role="menu" style={popover}>
            <div style={{ fontSize: 12, color: TEXT_MUTED, padding: "2px 8px 6px" }}>Filter by column</div>
            {FILTER_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setText(filters.q);
                  setOpen(key);
                }}
                style={{ textAlign: "left", background: "transparent", border: "none", padding: "7px 8px", borderRadius: 6, cursor: "pointer", fontSize: 14, color: NAVY, fontWeight: active.includes(key) ? 700 : 500 }}
              >
                {FILTER_LABELS[key]}
                {active.includes(key) ? "  ✓" : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {active.map((key) => (
        <div key={key} style={{ position: "relative" }}>
          <span style={chip}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open === key}
              onClick={() => {
                setText(filters.q);
                setOpen(open === key ? null : key);
              }}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: NAVY, fontWeight: 600, fontSize: 13 }}
            >
              {describeFilter(filters, key, ownerNames)}
            </button>
            <button
              type="button"
              aria-label={`Remove the ${FILTER_LABELS[key]} filter`}
              onClick={() => setValues(key, [])}
              style={{ background: "transparent", border: "none", padding: "0 4px", cursor: "pointer", color: TEXT_MUTED, fontSize: 15, lineHeight: 1 }}
            >
              ×
            </button>
          </span>
          {open === key && (
            <div role="dialog" aria-label={`Filter ${FILTER_LABELS[key]}`} style={popover}>
              {picker(key)}
            </div>
          )}
        </div>
      ))}

      {/* a column picked from the menu that has no values chosen yet */}
      {open && open !== "menu" && !active.includes(open) && (
        <div style={{ position: "relative" }}>
          <span style={{ ...chip, padding: "4px 12px", borderStyle: "dashed" }}>{FILTER_LABELS[open]}…</span>
          <div role="dialog" aria-label={`Filter ${FILTER_LABELS[open]}`} style={popover}>
            {picker(open)}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <button type="button" onClick={clearAll} style={{ background: "transparent", border: "none", color: NAVY, fontWeight: 600, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          Clear all
        </button>
      )}
      <span style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: "auto" }}>
        {active.length > 0 ? `Showing ${shown} of ${total} items` : `${total} items`}
      </span>
    </div>
  );
}
