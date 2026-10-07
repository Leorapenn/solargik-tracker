"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate, parseDateInput } from "@/lib/dates";
import { CHANGE_ORDER_INVOICE_STATUS, CHANGE_ORDER_STATUS, MILESTONE_STATUS, changeOrderDisplay, effectiveStatus, formatTerms, milestoneAmount, milestoneTotals, money, upcomingMilestoneId } from "@/lib/payments";
import type { PaymentData } from "@/server/services/payments";
import { ChoicePill } from "@/components/ColorSelect";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, secondaryButton } from "@/lib/theme";

const fmt = (iso: string | null) => (iso ? formatDate(parseDateInput(iso)) : "—");

// Read-only payments on the project page. Each milestone shows its amount and status; hover (or click) it to see
// the due date, the date the invoice was sent and the date it was paid. Finance edits these on the Payments tab.
export function PaymentsCard({ projectId, data, todayIso }: { projectId: string; data: PaymentData; todayIso: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const upcoming = upcomingMilestoneId(data.milestones);
  const totals = milestoneTotals(data.milestones, data.contractValue);
  const selected = data.milestones.find((m) => m.id === open) ?? null;

  const detail = (m: PaymentData["milestones"][number]) =>
    [
      `Due: ${fmt(m.dueDate)}`,
      `Invoice sent: ${fmt(m.invoiceSentDate)}`,
      `Paid: ${fmt(m.paidDate)}`,
      m.linkedName ? `Triggered by: ${m.linkedName}${m.linkedStatus === "DONE" ? " (done)" : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 20px" }}>
        <h2 style={{ margin: 0, fontSize: 17, color: NAVY }}>Payments</h2>
        <span style={{ color: TEXT_MUTED, fontSize: 13.5, flex: 1 }}>
          Paid <strong style={{ color: NAVY }}>{money(totals.paid, data.currency)}</strong> of {money(data.contractValue, data.currency)}
          {data.changeOrders.length > 0 && ` · ${data.changeOrders.length} change order${data.changeOrders.length === 1 ? "" : "s"}`}
        </span>
        <Link href={`/payments/${projectId}`} style={{ ...secondaryButton, textDecoration: "none", display: "inline-block" }}>
          Open in Payments
        </Link>
      </div>

      {data.milestones.length === 0 ? (
        <div style={{ padding: "0 20px 18px", color: TEXT_MUTED }}>No payment milestones yet.</div>
      ) : (
        <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {data.milestones.map((m) => {
              const status = effectiveStatus(m, todayIso);
              const isUpcoming = m.id === upcoming;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={detail(m)}
                  aria-expanded={open === m.id}
                  onClick={() => setOpen(open === m.id ? null : m.id)}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: isUpcoming ? "#FFF7E6" : "#fff",
                    border: isUpcoming ? "2px solid #F28C28" : `1px solid ${ROW_DIVIDER}`,
                    font: "inherit",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT_MUTED }}>
                    {m.label}
                    {isUpcoming && <span style={{ marginLeft: 6, color: "#B85E00" }}>· Upcoming</span>}
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{money(milestoneAmount(m, data.contractValue), data.currency)}</span>
                  <span>
                    <ChoicePill choice={MILESTONE_STATUS[status]} />
                  </span>
                </button>
              );
            })}
          </div>
          {selected && (
            <div role="region" aria-label={`Dates for ${selected.label}`} style={{ background: "#F6F7FB", borderRadius: 8, padding: "10px 14px", fontSize: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
              <span>
                <span style={{ color: TEXT_MUTED }}>Due </span>
                {fmt(selected.dueDate)}
              </span>
              <span>
                <span style={{ color: TEXT_MUTED }}>Invoice sent </span>
                {fmt(selected.invoiceSentDate)}
              </span>
              <span>
                <span style={{ color: TEXT_MUTED }}>Paid </span>
                {fmt(selected.paidDate)}
              </span>
              {selected.linkedName && (
                <span>
                  <span style={{ color: TEXT_MUTED }}>Triggered by </span>
                  {selected.linkedName}
                  {selected.linkedStatus === "DONE" ? " (done)" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {data.changeOrders.length > 0 && (
        <div style={{ borderTop: `1px solid ${ROW_DIVIDER}`, padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: TEXT_MUTED }}>Change orders</div>
          {data.changeOrders.map((c) => {
            const shown = changeOrderDisplay(c, todayIso);
            return (
              <div
                key={c.id}
                style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}
                title={`Sent: ${fmt(c.dateSent)}\nInvoiced: ${fmt(c.invoicedDate)}\nTerms: ${formatTerms(c.paymentTermsDays) ?? "—"}\nDue: ${fmt(shown.dueDate)}`}
              >
                <span style={{ flex: "1 1 260px", minWidth: 0 }}>{c.reason}</span>
                <strong style={{ color: NAVY }}>{money(c.amount, data.currency)}</strong>
                {shown.dueDate && c.invoiceStatus !== "PAID" && (
                  <span style={{ fontSize: 13, color: shown.overdue ? "#8C1D18" : TEXT_MUTED, fontWeight: shown.overdue ? 600 : 400 }}>Due {fmt(shown.dueDate)}</span>
                )}
                <ChoicePill choice={CHANGE_ORDER_STATUS.find((s) => s.value === shown.status) ?? null} />
                <ChoicePill choice={CHANGE_ORDER_INVOICE_STATUS.find((s) => s.value === shown.invoiceStatus) ?? null} />
                {c.fileLink && (
                  <a href={c.fileLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
                    File
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
