"use client";

import { useState, useTransition } from "react";
import type { Department, PhaseName, StageStatus } from "@prisma/client";
import { updateSubStages, updateSubStageStatus, type PatchInput } from "@/server/actions/updateStatus";
import { formatDate, parseDateInput } from "@/lib/dates";
import { STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import type { SortState } from "@/lib/sort";
import { DateField, type DateChoice } from "@/components/DateField";
import { ColumnFilters } from "@/components/ColumnFilters";
import { SortSummary } from "@/components/SortSummary";
import { SortTh } from "@/components/SortTh";
import { StatusSelect } from "@/components/StatusSelect";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

// Dates are "YYYY-MM-DD" strings so they cross the server/client boundary cleanly.
export type SubStageRow = {
  id: string;
  order: number;
  phaseName: PhaseName;
  phaseLabel: string;
  name: string;
  department: Department;
  departmentLabel: string;
  status: StageStatus;
  ownerId: string | null;
  ownerName: string | null;
  targetDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  // dates marked "N/A" (don't apply to this item): "targetDate" | "startedAt" | "completedAt"
  naDates: string[];
};

type Params = Record<string, string | string[] | undefined>;

const SORT_LABELS = {
  phase: "Phase",
  name: "Sub-stage",
  department: "Department",
  owner: "Owner",
  target: "Target",
  started: "Started",
  completed: "Completed",
  status: "Status",
};
type BulkField = "status" | "ownerId" | "targetDate" | "startedAt" | "completedAt";

const FIELD_LABELS: Record<BulkField, string> = {
  status: "Status",
  ownerId: "Owner",
  targetDate: "Target date",
  startedAt: "Start date",
  completedAt: "Completed date",
};
const STATUSES: StageStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"];

const th = { padding: "13px 14px", textAlign: "left" as const, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const };
const td = { padding: "10px 14px", fontSize: 14, verticalAlign: "middle" as const };

const fmt = (value: string | null) => (value ? formatDate(parseDateInput(value)) : "—");

export function SubStageTable({
  rows,
  people,
  sort,
  basePath,
  params,
  todayIso,
  totalCount,
}: {
  rows: SubStageRow[];
  people: { id: string; name: string }[];
  sort: SortState;
  basePath: string;
  params: Params;
  todayIso: string;
  // how many items the project has before any filter
  totalCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [field, setField] = useState<BulkField>("status");
  const [value, setValue] = useState("NOT_STARTED");
  // for the date fields in the bulk bar: null until a date, N/A or Clear has been chosen
  const [dateChoice, setDateChoice] = useState<DateChoice | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const phases = [...new Map(rows.map((r) => [r.phaseName, r.phaseLabel])).entries()];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const sortProps = { current: sort, basePath, params, style: th };

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectPhase(name: PhaseName) {
    const ids = rows.filter((r) => r.phaseName === name).map((r) => r.id);
    const everySelected = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of ids) {
      if (everySelected) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
  }

  function chooseField(next: BulkField) {
    setField(next);
    setValue(next === "status" ? "NOT_STARTED" : "");
    setDateChoice(null);
  }

  const isDateField = field !== "status" && field !== "ownerId";
  const choiceText = !dateChoice
    ? "Choose a date, N/A or Clear"
    : dateChoice.notApplicable
      ? "will be set to N/A"
      : dateChoice.date
        ? `will be set to ${formatDate(parseDateInput(dateChoice.date))}`
        : "will be cleared";

  function save(ids: string[], patch: PatchInput, success?: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateSubStages(ids, patch);
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      const skipped = result.skippedCompletedDate
        ? ` The completed date was skipped for ${result.skippedCompletedDate} item${result.skippedCompletedDate === 1 ? "" : "s"} that aren't Done.`
        : "";
      if (success || result.skippedCompletedDate) setMessage({ kind: "ok", text: `${success ?? "Saved."}${skipped}` });
    });
  }

  function applyBulk() {
    const ids = [...selected];
    if (isDateField && !dateChoice) return;
    const patch: PatchInput =
      field === "status"
        ? { status: value as StageStatus }
        : field === "ownerId"
          ? { ownerId: value || null }
          : { [field]: dateChoice!.notApplicable ? "NA" : dateChoice!.date };
    save(ids, patch, `Updated ${ids.length} item${ids.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    setDateChoice(null);
  }

  const ownerOptions = (row: SubStageRow) => {
    const known = people.some((p) => p.id === row.ownerId);
    return (
      <>
        <option value="">Unassigned</option>
        {!known && row.ownerId && <option value={row.ownerId}>{row.ownerName} (inactive)</option>}
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </>
    );
  };

  const dateCell = (row: SubStageRow, key: "targetDate" | "startedAt" | "completedAt") => {
    const current = row[key];
    const notApplicable = row.naDates.includes(key);
    const editable = key !== "completedAt" || row.status === "DONE";
    if (editing && editable) {
      return (
        <DateField
          ariaLabel={`${FIELD_LABELS[key]} for ${row.name}`}
          value={current}
          notApplicable={notApplicable}
          allowNotApplicable
          disabled={pending}
          onCommit={(choice) => save([row.id], { [key]: choice.notApplicable ? "NA" : choice.date })}
        />
      );
    }
    if (notApplicable) {
      return (
        <span style={{ color: TEXT_MUTED }} title="Marked as not applicable to this item">
          N/A
        </span>
      );
    }
    if (key === "completedAt" && row.status === "DONE" && !current) {
      return <span style={{ color: "#9A4B00", fontWeight: 600 }} title="This item is done but has no completion date. Use Edit to add it.">⚠ add date</span>;
    }
    if (key === "targetDate" && current && row.status !== "DONE" && current < todayIso) {
      return (
        <span style={{ color: "#B3261E", fontWeight: 600 }} title="Past its target date and not done">
          {fmt(current)} · overdue
        </span>
      );
    }
    return <span style={{ color: current ? undefined : TEXT_MUTED }}>{fmt(current)}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <ColumnFilters basePath={basePath} params={params} people={people} shown={rows.length} total={totalCount} />
        <button
          type="button"
          style={editing ? primaryButton : secondaryButton}
          aria-pressed={editing}
          onClick={() => {
            setEditing(!editing);
            setSelected(new Set());
            setMessage(null);
          }}
        >
          {editing ? "Done editing" : "Edit"}
        </button>
      </div>

      {editing && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select
            aria-label="Select items"
            value=""
            style={{ ...inputStyle, fontWeight: 600, color: NAVY }}
            onChange={(event) => {
              const choice = event.target.value;
              if (choice === "all") setSelected(new Set(rows.map((r) => r.id)));
              else if (choice === "none") setSelected(new Set());
              else if (choice) selectPhase(choice as PhaseName);
            }}
          >
            <option value="">Select items…</option>
            <option value="all">All shown ({rows.length})</option>
            <option value="none">None</option>
            {phases.map(([name, label]) => (
              <option key={name} value={name}>
                {label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: TEXT_MUTED }}>
            Change owners, dates and status in the table, or tick items to change several at once.
          </span>
        </div>
      )}

      {editing && selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk edit"
          style={{ ...cardStyle, padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderColor: NAVY }}
        >
          <strong style={{ color: NAVY }}>{selected.size} selected</strong>
          <span style={{ color: TEXT_MUTED, fontSize: 13 }}>Set</span>
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
          {isDateField && (
            <>
              <DateField
                ariaLabel={`New ${FIELD_LABELS[field].toLowerCase()}`}
                value={dateChoice?.date ?? null}
                notApplicable={dateChoice?.notApplicable ?? false}
                allowNotApplicable
                onCommit={setDateChoice}
              />
              <span style={{ fontSize: 12, color: dateChoice ? NAVY : TEXT_MUTED }}>{choiceText}</span>
            </>
          )}
          <button type="button" disabled={pending || (isDateField && !dateChoice)} style={primaryButton} onClick={applyBulk}>
            Apply to {selected.size}
          </button>
          <button type="button" style={secondaryButton} onClick={() => setSelected(new Set())}>
            Clear
          </button>
          {field === "completedAt" && <span style={{ fontSize: 12, color: TEXT_MUTED }}>Only Done items have a completed date.</span>}
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
        <SortSummary basePath={basePath} params={params} current={sort} labels={SORT_LABELS} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                {editing && (
                  <th style={{ ...th, width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all items"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    />
                  </th>
                )}
                <SortTh label="Phase" sortKey="phase" {...sortProps} />
                <SortTh label="Sub-stage" sortKey="name" {...sortProps} />
                <SortTh label="Department" sortKey="department" {...sortProps} />
                <SortTh label="Owner" sortKey="owner" {...sortProps} />
                <SortTh label="Target" sortKey="target" {...sortProps} />
                <SortTh label="Started" sortKey="started" {...sortProps} />
                <SortTh label="Completed" sortKey="completed" {...sortProps} />
                <SortTh label="Status" sortKey="status" {...sortProps} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, background: selected.has(row.id) ? "#F1F5FD" : undefined }}
                >
                  {editing && (
                    <td style={td}>
                      <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                    </td>
                  )}
                  <td style={{ ...td, color: TEXT_MUTED, whiteSpace: "nowrap" }}>{row.phaseLabel}</td>
                  <td style={{ ...td, fontWeight: 600, color: NAVY }}>{row.name}</td>
                  <td style={td}>{row.departmentLabel}</td>
                  <td style={td}>
                    {editing ? (
                      <select
                        aria-label={`Owner of ${row.name}`}
                        value={row.ownerId ?? ""}
                        disabled={pending}
                        style={{ ...inputStyle, padding: "5px 8px", fontSize: 13 }}
                        onChange={(e) => save([row.id], { ownerId: e.target.value || null })}
                      >
                        {ownerOptions(row)}
                      </select>
                    ) : (
                      <span style={{ color: row.ownerName ? undefined : TEXT_MUTED }}>{row.ownerName ?? "Unassigned"}</span>
                    )}
                  </td>
                  <td style={td}>{dateCell(row, "targetDate")}</td>
                  <td style={td}>{dateCell(row, "startedAt")}</td>
                  <td style={td}>{dateCell(row, "completedAt")}</td>
                  <td style={td}>
                    {editing ? (
                      <StatusSelect value={row.status} onChange={updateSubStageStatus.bind(null, row.id)} />
                    ) : (
                      <span
                        style={{
                          display: "inline-block",
                          background: STATUS_PILL_STYLES[row.status].bg,
                          color: STATUS_PILL_STYLES[row.status].text,
                          borderRadius: 999,
                          padding: "0.3rem 0.75rem",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={editing ? 9 : 8} style={{ ...td, color: TEXT_MUTED }}>
                    {totalCount > 0 ? "No items match these filters." : "This project has no items."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
