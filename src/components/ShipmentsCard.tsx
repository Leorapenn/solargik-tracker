"use client";

import { useState, useTransition } from "react";
import { removeProjectShipment, saveProjectShipment } from "@/server/actions/shipments";
import type { ShipmentView } from "@/server/services/shipments";
import { CUSTOMS_STATUSES, DATE_KEYS, DATE_LABELS, SHIPMENT_STATUSES, customsStatusChoice, shipmentStatusChoice, type ShipmentInput } from "@/lib/shipments";
import { formatDate, parseDateInput } from "@/lib/dates";
import { ChoicePill } from "@/components/ColorSelect";
import { DateField } from "@/components/DateField";
import { NAVY, ORANGE, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

const fmt = (iso: string | null) => (iso ? formatDate(parseDateInput(iso)) : null);
const small = { ...secondaryButton, padding: "4px 12px", fontSize: 13 } as const;

const blank: ShipmentInput = { reference: "", goods: "", forwarder: "", vessel: "", containers: "", portOfLoading: "", portOfDischarge: "", status: "BOOKED", customsStatus: "NOT_STARTED", etd: "", eta: "", arrivedAt: "", customsClearedAt: "", deliveryDate: "", deliveredAt: "", notes: "" };

const toInput = (s: ShipmentView): ShipmentInput => ({
  reference: s.reference, goods: s.goods ?? "", forwarder: s.forwarder ?? "", vessel: s.vessel ?? "", containers: s.containers.join(", "),
  portOfLoading: s.portOfLoading ?? "", portOfDischarge: s.portOfDischarge ?? "", status: s.status, customsStatus: s.customsStatus,
  etd: s.etd ?? "", eta: s.eta ?? "", arrivedAt: s.arrivedAt ?? "", customsClearedAt: s.customsClearedAt ?? "", deliveryDate: s.deliveryDate ?? "", deliveredAt: s.deliveredAt ?? "", notes: s.notes ?? "",
});

const field = (label: string, child: React.ReactNode, width?: number | string) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, width }}>
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: TEXT_MUTED }}>{label}</div>
    {child}
  </div>
);

// The project's shipments: containers, vessel, when they reach the port, where customs stands and when they reach the site.
// Read-only until Edit; the Inbox can propose changes from the forwarder's emails (nothing changes until approved).
export function ShipmentsCard({ projectId, shipments }: { projectId: string; shipments: ShipmentView[] }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ id: string; data: ShipmentInput } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<ShipmentInput>) => setForm((f) => (f ? { ...f, data: { ...f.data, ...patch } } : f));
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) after?.();
      else setError(r.error ?? "That didn't work.");
    });

  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: NAVY }}>
          Shipments{shipments.length > 0 ? ` (${shipments.length})` : ""}
        </div>
        <button type="button" style={editing ? primaryButton : secondaryButton} aria-pressed={editing} onClick={() => { setEditing(!editing); setForm(null); setError(null); }}>
          {editing ? "Done editing" : "Edit"}
        </button>
      </div>
      <div style={{ width: 28, height: 3, borderRadius: 2, background: ORANGE, margin: "8px 0 10px" }} />

      {shipments.length === 0 && !form && (
        <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No shipments yet. They are proposed from the forwarder&apos;s emails in the Inbox, or added here with Edit.</div>
      )}

      {shipments.map((s, i) => {
        if (form?.id === s.id) return null;
        const dates = DATE_KEYS.map((k) => [DATE_LABELS[k], fmt(s[k])] as const).filter(([, v]) => v);
        return (
          <div key={s.id} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${ROW_DIVIDER}`, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ color: NAVY, fontSize: 15 }}>{s.reference}</strong>
              <span style={{ color: TEXT_MUTED, fontSize: 13.5 }}>{[s.goods, s.forwarder && `via ${s.forwarder}`].filter(Boolean).join(" · ")}</span>
              <ChoicePill choice={shipmentStatusChoice(s.status)} />
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 12.5, color: TEXT_MUTED }}>
                Customs <ChoicePill choice={customsStatusChoice(s.customsStatus)} />
              </span>
            </div>
            <div style={{ fontSize: 13.5, display: "flex", gap: "2px 16px", flexWrap: "wrap" }}>
              {s.vessel && <span>Vessel: {s.vessel}</span>}
              {(s.portOfLoading || s.portOfDischarge) && <span>{s.portOfLoading ?? "?"} → {s.portOfDischarge ?? "?"}</span>}
              {s.containers.length > 0 && <span title={s.containers.join(", ")}>Containers ({s.containers.length}): {s.containers.join(", ")}</span>}
            </div>
            {dates.length > 0 && (
              <div style={{ fontSize: 13.5, display: "flex", gap: "2px 16px", flexWrap: "wrap" }}>
                {dates.map(([label, v]) => (
                  <span key={label}>
                    <span style={{ color: TEXT_MUTED }}>{label}:</span> <strong>{v}</strong>
                  </span>
                ))}
              </div>
            )}
            {s.notes && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{s.notes}</div>}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {s.sourceLink && (
                <a href={s.sourceLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700, fontSize: 13 }}>
                  Open the last email
                </a>
              )}
              {editing && (
                <>
                  <button type="button" style={small} disabled={pending} onClick={() => setForm({ id: s.id, data: toInput(s) })}>
                    Edit
                  </button>
                  <button type="button" style={{ ...small, color: "#8C1D18" }} disabled={pending} onClick={() => { if (window.confirm(`Delete the shipment "${s.reference}"?`)) go(() => removeProjectShipment(projectId, s.id)); }}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {form && (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${ROW_DIVIDER}`, paddingTop: 14, marginTop: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            go(() => saveProjectShipment(projectId, form.id, form.data), () => setForm(null));
          }}
        >
          <strong style={{ color: NAVY, fontSize: 14 }}>{form.id ? "Edit shipment" : "New shipment"}</strong>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {field("Name (PO, invoice, “Shipment #02”)", <input aria-label="Shipment name" value={form.data.reference} maxLength={120} onChange={(e) => set({ reference: e.target.value })} style={{ ...inputStyle, width: 240 }} autoFocus />)}
            {field("Goods", <input aria-label="Goods" value={form.data.goods} maxLength={200} placeholder="e.g. Pylons" onChange={(e) => set({ goods: e.target.value })} style={{ ...inputStyle, width: 200 }} />)}
            {field("Forwarder", <input aria-label="Forwarder" value={form.data.forwarder} maxLength={120} placeholder="e.g. Viamar" onChange={(e) => set({ forwarder: e.target.value })} style={{ ...inputStyle, width: 160 }} />)}
            {field("Vessel", <input aria-label="Vessel" value={form.data.vessel} maxLength={120} onChange={(e) => set({ vessel: e.target.value })} style={{ ...inputStyle, width: 180 }} />)}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {field("Port of loading", <input aria-label="Port of loading" value={form.data.portOfLoading} maxLength={120} onChange={(e) => set({ portOfLoading: e.target.value })} style={{ ...inputStyle, width: 180 }} />)}
            {field("Port of discharge", <input aria-label="Port of discharge" value={form.data.portOfDischarge} maxLength={120} onChange={(e) => set({ portOfDischarge: e.target.value })} style={{ ...inputStyle, width: 180 }} />)}
            {field(
              "Status",
              <select aria-label="Shipment status" value={form.data.status} onChange={(e) => set({ status: e.target.value })} style={inputStyle}>
                {SHIPMENT_STATUSES.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>,
            )}
            {field(
              "Customs",
              <select aria-label="Customs status" value={form.data.customsStatus} onChange={(e) => set({ customsStatus: e.target.value })} style={inputStyle}>
                {CUSTOMS_STATUSES.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>,
            )}
          </div>
          {field("Containers (comma or one per line)", <textarea aria-label="Containers" rows={2} value={form.data.containers} placeholder="e.g. TCNU5368259, BHCU3190171" onChange={(e) => set({ containers: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" }} />)}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {DATE_KEYS.map((k) => (
              <div key={k}>{field(DATE_LABELS[k], <DateField ariaLabel={DATE_LABELS[k]} value={form.data[k] || null} onCommit={(c) => set({ [k]: c.date ?? "" })} />)}</div>
            ))}
          </div>
          {field("Note", <textarea aria-label="Note" rows={2} value={form.data.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" }} />)}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" disabled={pending} style={primaryButton}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" style={secondaryButton} onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {editing && !form && (
        <button type="button" style={{ ...small, marginTop: 10 }} onClick={() => setForm({ id: "", data: { ...blank } })}>
          + Add shipment
        </button>
      )}
      {error && (
        <div role="alert" style={{ color: "#8C1D18", fontSize: 13.5, marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
