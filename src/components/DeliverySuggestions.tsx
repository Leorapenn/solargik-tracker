"use client";

import { useState, useTransition } from "react";
import { acceptDeliveryProposal } from "@/server/actions/deliveryProposals";
import type { DeliveryProposal } from "@/lib/deliveryProposal";
import { formatDate, parseDateInput } from "@/lib/dates";
import { NAVY, TEXT_MUTED, cardStyle, primaryButton } from "@/lib/theme";

const fmt = (iso: string) => formatDate(parseDateInput(iso));

// Suggested Supply sub-stages: shown when the shipments say a Delivery item is complete (every shipment of its goods delivered, one of them
// flagged as the completion shipment), or the Delivery items are all done. Nothing changes until "Mark Done" is pressed.
export function DeliverySuggestions({ projectId, proposals }: { projectId: string; proposals: DeliveryProposal[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (proposals.length === 0 && !message) return null;

  return (
    <div style={{ ...cardStyle, padding: "14px 20px", background: "#FFF8E6", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A5300" }}>Suggested from the shipments</div>
      {proposals.map((p) => (
        <div key={p.key} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ minWidth: 260, flex: "1 1 300px" }}>
            <div style={{ fontSize: 14.5 }}>
              <strong style={{ color: NAVY }}>{p.itemName}</strong> {p.key === "SUPPLY_COMPLETION"
                ? "can be completed: the Delivery sub-stages that apply are all Done."
                : p.flagged
                  ? "looks complete: every shipment of these goods is delivered, and one is the completion shipment."
                  : "may be complete: every shipment so far of these goods is delivered, but none is flagged as the completion shipment, so more may still come."}
            </div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, overflowWrap: "anywhere" }}>
              {p.evidence.map((e) => `${e.label}${e.day ? ` (${fmt(e.day)})` : ""}`).join(" · ")}
            </div>
          </div>
          <button
            type="button"
            style={primaryButton}
            disabled={pending}
            title="Sets the sub-stage to Done with this day as its completed date, like a change by hand"
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await acceptDeliveryProposal(projectId, p.key);
                setMessage(result.ok ? { ok: true, text: result.note } : { ok: false, text: result.error });
              })
            }
          >
            {pending ? "Working…" : `Mark Done on ${fmt(p.completedOn)}`}
          </button>
        </div>
      ))}
      {message && (
        <div role={message.ok ? "status" : "alert"} style={{ fontSize: 13.5, color: message.ok ? "#047857" : "#8C1D18" }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
