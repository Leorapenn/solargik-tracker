"use client";

import { useState, useTransition } from "react";
import { saveWarrantyYears } from "@/server/actions/warranty";
import { formatDate, parseDateInput } from "@/lib/dates";
import { WARRANTY_DEFAULT_YEARS, type WarrantyStatus } from "@/lib/warranty";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

export type WarrantyRow = {
  key: string;
  label: string;
  item: string;
  years: number;
  deliveredOn: string | null;
  expiresOn: string | null;
  leftText: string | null; // "9 years 3 months left"
  status: WarrantyStatus;
};

const STATUS: Record<WarrantyStatus, { label: string; bg: string; text: string }> = {
  NOT_DELIVERED: { label: "Not delivered yet", bg: "#E4E6EC", text: "#4A4F5C" },
  NEEDS_DATE: { label: "Add the delivery date", bg: "#FEF0D2", text: "#8A5A00" },
  ACTIVE: { label: "Active", bg: "#D8F5E3", text: "#047857" },
  EXPIRING: { label: "Expiring soon", bg: "#FEF0D2", text: "#8A5A00" },
  EXPIRED: { label: "Expired", bg: "#FCE0DD", text: "#8C1D18" },
};

const fmt = (iso: string | null) => (iso ? formatDate(parseDateInput(iso)) : "—");

// The product warranty of a project, worked out from the delivery items (see src/lib/warranty.ts). The periods are
// the contract's (10 years structural, 5 years drive unit) unless this project has its own.
export function WarrantyCard({
  projectId,
  rows,
  structuralYears,
  driveYears,
}: {
  projectId: string;
  rows: WarrantyRow[];
  structuralYears: number | null;
  driveYears: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [structural, setStructural] = useState(structuralYears?.toString() ?? "");
  const [drive, setDrive] = useState(driveYears?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveWarrantyYears(projectId, { structural, drive });
      if (result.ok) setEditing(false);
      else setError(result.error);
    });
  };

  const th = { padding: "10px 14px", textAlign: "left" as const, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "10px 14px", fontSize: 14, verticalAlign: "middle" as const };
  const custom = structuralYears !== null || driveYears !== null;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 20px" }}>
        <h2 style={{ margin: 0, fontSize: 17, color: NAVY }}>Warranty</h2>
        <span style={{ color: TEXT_MUTED, fontSize: 13.5, flex: 1 }}>
          From the delivery date: {structuralYears ?? WARRANTY_DEFAULT_YEARS.structural} years for structural units, {driveYears ?? WARRANTY_DEFAULT_YEARS.drive} years for the drive unit
          {custom ? " (this project's own periods)" : " (contract)"}.
        </span>
        {!editing && (
          <button type="button" style={secondaryButton} onClick={() => setEditing(true)}>
            Edit periods
          </button>
        )}
      </div>

      {editing && (
        <div style={{ padding: "0 20px 14px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: TEXT_MUTED }}>
            Structural units (years)
            <input aria-label="Structural units warranty years" inputMode="numeric" placeholder={String(WARRANTY_DEFAULT_YEARS.structural)} value={structural} onChange={(e) => setStructural(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: TEXT_MUTED }}>
            Drive unit (years)
            <input aria-label="Drive unit warranty years" inputMode="numeric" placeholder={String(WARRANTY_DEFAULT_YEARS.drive)} value={drive} onChange={(e) => setDrive(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </label>
          <button type="button" disabled={pending} style={primaryButton} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" style={secondaryButton} onClick={() => setEditing(false)}>
            Cancel
          </button>
          <span style={{ fontSize: 12.5, color: TEXT_MUTED }}>Leave a box empty to use the contract&apos;s {WARRANTY_DEFAULT_YEARS.structural} / {WARRANTY_DEFAULT_YEARS.drive} years.</span>
          {error && (
            <div role="alert" style={{ color: "#8C1D18", fontSize: 13, flexBasis: "100%" }}>
              {error}
            </div>
          )}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead>
            <tr style={{ background: NAVY, color: "#fff" }}>
              {["Equipment", "Delivered (item)", "Period", "Delivered on", "Expires on", "Time left", "Status"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = STATUS[r.status];
              return (
                <tr key={r.key} style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                  <td style={{ ...td, fontWeight: 700, color: NAVY }}>{r.label}</td>
                  <td style={{ ...td, color: TEXT_MUTED }}>{r.item}</td>
                  <td style={td}>{r.years} years</td>
                  <td style={td}>{fmt(r.deliveredOn)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmt(r.expiresOn)}</td>
                  <td style={{ ...td, color: r.status === "EXPIRED" ? "#8C1D18" : undefined }}>{r.leftText ?? "—"}</td>
                  <td style={td}>
                    <span style={{ display: "inline-block", background: s.bg, color: s.text, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{s.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 20px 14px", fontSize: 12.5, color: TEXT_MUTED }}>
        The warranty starts when the delivery item below is marked Done, on its completed date. To change a delivery date, edit that item&apos;s completed date in the table further down.
      </div>
    </div>
  );
}
