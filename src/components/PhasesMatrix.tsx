"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { PhaseName, ProjectLifecycle, StageStatus } from "@prisma/client";
import { updatePhases, type PatchInput } from "@/server/actions/updateStatus";
import { formatDate, parseDateInput } from "@/lib/dates";
import { PHASE_ORDER, phaseLabel } from "@/lib/phases";
import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from "@/lib/lifecycle";
import { STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import type { SortState } from "@/lib/sort";
import { SortTh } from "@/components/SortTh";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

export type MatrixCell = {
  phaseId: string;
  status: StageStatus;
  done: number;
  total: number;
  startedAt: string | null;
  completedAt: string | null;
  targetDate: string | null;
  owners: string[];
  doneWithoutDate: number;
  overdue: boolean;
};

export type MatrixRow = {
  projectId: string;
  projectName: string;
  customerName: string;
  lifecycle: ProjectLifecycle;
  cells: Record<PhaseName, MatrixCell | null>;
};

type Params = Record<string, string | string[] | undefined>;
type BulkField = "status" | "ownerId" | "targetDate" | "startedAt" | "completedAt";

const FIELD_LABELS: Record<BulkField, string> = {
  status: "Status",
  ownerId: "Owner",
  targetDate: "Target date",
  startedAt: "Start date",
  completedAt: "Completed date",
};
const STATUSES: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

const th = { padding: "13px 14px", textAlign: "left" as const, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
const td = { padding: "10px 14px", fontSize: 13.5, verticalAlign: "top" as const };

const fmt = (value: string | null) => (value ? formatDate(parseDateInput(value)) : null);

export function PhasesMatrix({
  rows,
  people,
  sort,
  params,
}: {
  rows: MatrixRow[];
  people: { id: string; name: string }[];
  sort: SortState;
  params: Params;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [field, setField] = useState<BulkField>("status");
  const [value, setValue] = useState("NOT_STARTED");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const allCells = rows.flatMap((r) => PHASE_ORDER.map((p) => r.cells[p]).filter((c): c is MatrixCell => !!c));
  const itemCount = allCells.filter((c) => selected.has(c.phaseId)).reduce((sum, c) => sum + c.total, 0);
  const sortProps = { current: sort, basePath: "/phases", params, style: th };

  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setSelected(next);
  };
  const allOn = (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id));
  const columnIds = (phase: PhaseName) => rows.map((r) => r.cells[phase]?.phaseId).filter((id): id is string => !!id);
  const rowIds = (row: MatrixRow) => PHASE_ORDER.map((p) => row.cells[p]?.phaseId).filter((id): id is string => !!id);

  function chooseField(next: BulkField) {
    setField(next);
    setValue(next === "status" ? "NOT_STARTED" : "");
  }

  function apply() {
    const ids = [...selected];
    const patch: PatchInput =
      field === "status" ? { status: value as StageStatus } : field === "ownerId" ? { ownerId: value || null } : { [field]: value || null };
    const what = field === "status" ? `status to "${STATUS_LABELS[value as StageStatus]}"` : `${FIELD_LABELS[field].toLowerCase()}`;
    if (!window.confirm(`Change the ${what} for every item in ${ids.length} phase${ids.length === 1 ? "" : "s"} (${itemCount} items)?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updatePhases(ids, patch);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setSelected(new Set());
      const skipped = result.skippedCompletedDate
        ? ` The completed date was skipped for ${result.skippedCompletedDate} item${result.skippedCompletedDate === 1 ? "" : "s"} that aren't Done.`
        : "";
      setMessage({ kind: "ok", text: `Updated ${result.updated} of ${result.items ?? itemCount} items.${skipped}` });
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk edit"
          style={{ ...cardStyle, padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderColor: NAVY }}
        >
          <strong style={{ color: NAVY }}>
            {selected.size} phase{selected.size === 1 ? "" : "s"} selected ({itemCount} items)
          </strong>
          <span style={{ color: TEXT_MUTED, fontSize: 13 }}>Set every item&apos;s</span>
          <select aria-label="Field to change" value={field} onChange={(e) => chooseField(e.target.value as BulkField)} style={inputStyle}>
            {(Object.keys(FIELD_LABELS) as BulkField[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
          <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
          {field === "status" && (
            <select aria-label="New status" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
          {field === "ownerId" && (
            <select aria-label="New owner" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {field !== "status" && field !== "ownerId" && (
            <input type="date" aria-label={`New ${FIELD_LABELS[field]}`} value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
          )}
          <button type="button" disabled={pending} style={primaryButton} onClick={apply}>
            Apply
          </button>
          <button type="button" style={secondaryButton} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 14,
            background: message.kind === "ok" ? "#D8F5E3" : "#FCE9E7",
            color: message.kind === "ok" ? "#047857" : "#8C1D18",
          }}
        >
          {message.text}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1200 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                <SortTh label="Project" sortKey="project" {...sortProps} />
                <SortTh label="Customer" sortKey="customer" {...sortProps} />
                {PHASE_ORDER.map((phase) => (
                  <th key={phase} style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        aria-label={`Select the ${phaseLabel(phase)} phase for all projects`}
                        checked={allOn(columnIds(phase))}
                        onChange={(e) => setMany(columnIds(phase), e.target.checked)}
                      />
                      <SortTh label={phaseLabel(phase)} sortKey={phase} {...sortProps} style={{ padding: 0 }} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ids = rowIds(row);
                const style = LIFECYCLE_STYLES[row.lifecycle];
                return (
                  <tr key={row.projectId} style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, opacity: row.lifecycle === "CANCELLED" ? 0.6 : 1 }}>
                    <td style={{ ...td, fontWeight: 700 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          aria-label={`Select every phase of ${row.projectName}`}
                          checked={allOn(ids)}
                          onChange={(e) => setMany(ids, e.target.checked)}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <Link href={`/projects/${row.projectId}`} style={{ color: NAVY }}>
                            {row.projectName}
                          </Link>
                          {row.lifecycle !== "ACTIVE" && (
                            <div
                              style={{
                                marginTop: 4,
                                display: "inline-block",
                                fontSize: 11.5,
                                fontWeight: 700,
                                borderRadius: 999,
                                padding: "2px 8px",
                                background: style.bg,
                                color: style.text,
                              }}
                            >
                              {LIFECYCLE_LABELS[row.lifecycle]}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, color: TEXT_MUTED }}>{row.customerName}</td>
                    {PHASE_ORDER.map((phase) => {
                      const cell = row.cells[phase];
                      if (!cell) return <td key={phase} style={td}>—</td>;
                      const { bg, text } = STATUS_PILL_STYLES[cell.status];
                      const started = fmt(cell.startedAt);
                      const completed = fmt(cell.completedAt);
                      const due = fmt(cell.targetDate);
                      return (
                        <td key={phase} style={td} title={cell.owners.length ? `Owner: ${cell.owners.join(", ")}` : "No owner assigned"}>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${phaseLabel(phase)} of ${row.projectName}`}
                              checked={selected.has(cell.phaseId)}
                              onChange={(e) => setMany([cell.phaseId], e.target.checked)}
                              style={{ marginTop: 4 }}
                            />
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <span style={{ alignSelf: "flex-start", background: bg, color: text, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {STATUS_LABELS[cell.status]}
                              </span>
                              {cell.status === "DONE" && (
                                <span style={{ fontSize: 12, color: completed ? TEXT_MUTED : "#9A4B00", fontWeight: completed ? 400 : 600 }}>
                                  {completed ? `Done ${completed}` : "⚠ no date"}
                                </span>
                              )}
                              {cell.status !== "DONE" && started && <span style={{ fontSize: 12, color: TEXT_MUTED }}>Since {started}</span>}
                              {cell.status !== "DONE" && due && (
                                <span style={{ fontSize: 12, color: cell.overdue ? "#B3261E" : TEXT_MUTED, fontWeight: cell.overdue ? 600 : 400 }}>
                                  Due {due}
                                  {cell.overdue ? " · overdue" : ""}
                                </span>
                              )}
                              {cell.doneWithoutDate > 0 && cell.status !== "DONE" && (
                                <span style={{ fontSize: 12, color: "#9A4B00" }}>⚠ {cell.doneWithoutDate} done without date</span>
                              )}
                              <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                                {cell.owners.length ? cell.owners.join(", ") : "No owner"}
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...td, color: TEXT_MUTED }}>
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 20px", fontSize: 13, color: TEXT_MUTED, borderTop: `1px solid ${ROW_DIVIDER}` }}>
          {rows.length} projects · tick phases to change an owner, dates or status for all their items at once
        </div>
      </div>
    </div>
  );
}
