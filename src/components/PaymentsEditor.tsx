"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { savePayments } from "@/server/actions/payments";
import { formatDate, parseDateInput } from "@/lib/dates";
import {
  CURRENCIES,
  CHANGE_ORDER_INVOICE_STATUS,
  CHANGE_ORDER_STATUS,
  MILESTONE_LABELS,
  MILESTONE_STATUS,
  OPTIONAL_LABELS,
  SETTABLE_MILESTONE_STATUSES,
  changeOrderDisplay,
  changeOrderDueDate,
  changeOrderStatusFor,
  effectiveStatus,
  formatTerms,
  milestoneAmount,
  milestoneTotals,
  money,
  upcomingMilestoneId,
  type ChangeOrderInput,
  type MilestoneInput,
} from "@/lib/payments";
import type { ChangeOrderView, MilestoneView, PaymentData } from "@/server/services/payments";
import { ChoicePill, ColorSelect } from "@/components/ColorSelect";
import { DateField } from "@/components/DateField";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

const fmt = (iso: string | null) => (iso ? formatDate(parseDateInput(iso)) : "—");
const DASH = <span style={{ color: TEXT_MUTED }}>—</span>;

const toMilestoneInput = (m: MilestoneView): MilestoneInput => ({
  id: m.id,
  label: m.label,
  optional: m.optional,
  percent: m.percent === null ? "" : String(m.percent),
  amountOverride: m.amountOverride === null ? "" : String(m.amountOverride),
  linkedSubStageId: m.linkedSubStageId ?? "",
  dueDate: m.dueDate ?? "",
  status: m.status,
  invoiceSentDate: m.invoiceSentDate ?? "",
  paidDate: m.paidDate ?? "",
});
const toChangeOrderInput = (c: ChangeOrderView): ChangeOrderInput => ({
  id: c.id,
  reason: c.reason,
  status: c.status,
  amount: c.amount === null ? "" : String(c.amount),
  dateSent: c.dateSent ?? "",
  invoicedDate: c.invoicedDate ?? "",
  invoiceStatus: c.invoiceStatus ?? "",
  paymentTermsDays: c.paymentTermsDays === null ? "" : String(c.paymentTermsDays),
  fileLink: c.fileLink ?? "",
});

type Keyed<T> = { key: string; data: T };
let counter = 0;
const keyed = <T,>(data: T): Keyed<T> => ({ key: `k${++counter}`, data });

const num = (s: string) => {
  const t = s.trim().replace(/[$€₪£,\s]/g, "");
  const n = Number(t);
  return t === "" || !Number.isFinite(n) ? null : n;
};

// The payments of one project: milestones (with the upcoming one highlighted) and change orders.
// Read-only until Edit is pressed; Save sends the whole list at once.
export function PaymentsEditor({ projectId, projectName, initial, todayIso }: { projectId: string; projectName: string; initial: PaymentData; todayIso: string }) {
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [milestones, setMilestones] = useState<Keyed<MilestoneInput>[]>([]);
  const [orders, setOrders] = useState<Keyed<ChangeOrderInput>[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [addPick, setAddPick] = useState<string | null>(null);
  // the project's currency and contract amount, editable together with the milestones
  const [currency, setCurrency] = useState(initial.currency);
  const [base, setBase] = useState(initial.paymentBase === null ? "" : String(initial.paymentBase));

  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setSaved(initial);
  }

  function startEditing() {
    setMilestones(saved.milestones.map((m) => keyed(toMilestoneInput(m))));
    setOrders(saved.changeOrders.map((c) => keyed(toChangeOrderInput(c))));
    setCurrency(saved.currency);
    setBase(saved.paymentBase === null ? "" : String(saved.paymentBase));
    setMessage(null);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setMessage(null);
  }
  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await savePayments(projectId, { milestones: milestones.map((m) => m.data), changeOrders: orders.map((o) => o.data), currency, paymentBase: base });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      // show what was just saved right away; the refreshed page data replaces it a moment later
      setSaved((s) => ({
        ...s,
        currency,
        paymentBase: num(base),
        contractValue: num(base) ?? s.mondayValue,
        milestones: milestones.map(({ key, data: m }, order): MilestoneView => {
          const item = s.items.find((i) => i.id === m.linkedSubStageId);
          const invoiced = m.status === "INVOICE_SENT" || m.status === "PAYMENT_RECEIVED";
          return {
            id: m.id || key,
            label: m.label.trim(),
            optional: m.optional,
            percent: num(m.percent),
            amountOverride: num(m.amountOverride),
            linkedSubStageId: m.linkedSubStageId || null,
            linkedName: item?.name ?? null,
            linkedStatus: item?.status ?? null,
            status: m.status,
            dueDate: m.dueDate || null,
            invoiceSentDate: invoiced ? m.invoiceSentDate || null : null,
            paidDate: m.status === "PAYMENT_RECEIVED" ? m.paidDate || null : null,
            order,
          };
        }),
        changeOrders: orders.map(({ key, data: o }): ChangeOrderView => ({
          id: o.id || key,
          reason: o.reason.trim(),
          status: changeOrderStatusFor(o.status, o.invoiceStatus || null),
          amount: num(o.amount),
          dateSent: o.dateSent || null,
          invoicedDate: o.invoicedDate || null,
          invoiceStatus: o.invoiceStatus || null,
          paymentTermsDays: num(o.paymentTermsDays),
          fileLink: o.fileLink.trim() || null,
        })),
      }));
      setEditing(false);
      setMessage({ kind: "ok", text: "Payments saved." });
    });
  }

  const setMilestone = (key: string, patch: Partial<MilestoneInput>) => setMilestones((list) => list.map((m) => (m.key === key ? { ...m, data: { ...m.data, ...patch } } : m)));
  const setOrder = (key: string, patch: Partial<ChangeOrderInput>) =>
    setOrders((list) =>
      list.map((o) => {
        if (o.key !== key) return o;
        const data = { ...o.data, ...patch };
        // a paid invoice completes the change order
        return { ...o, data: { ...data, status: changeOrderStatusFor(data.status, data.invoiceStatus || null) } };
      }),
    );

  const emptyMilestone = (label: string): MilestoneInput => ({
    id: "",
    label,
    optional: OPTIONAL_LABELS.includes(label),
    percent: "",
    amountOverride: "",
    linkedSubStageId: "",
    dueDate: "",
    status: "NOT_DUE",
    invoiceSentDate: "",
    paidDate: "",
  });
  const unusedLabels = MILESTONE_LABELS.filter((l) => !milestones.some((m) => m.data.label === l));
  // the dropdown offers the standard names not used yet, starting with the next one; "Other…" is a plain "Milestone N"
  const chosenLabel = addPick !== null && (addPick === "" || unusedLabels.includes(addPick)) ? addPick : (unusedLabels[0] ?? "");

  // ---- read-only view ----
  const viewMilestones = saved.milestones.map((m) => ({ ...m, effective: effectiveStatus(m, todayIso), amount: milestoneAmount(m, saved.contractValue) }));
  const upcoming = upcomingMilestoneId(saved.milestones);
  const totals = milestoneTotals(saved.milestones, saved.contractValue);

  const th = { padding: "10px 12px", textAlign: "left" as const, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "10px 12px", fontSize: 14, verticalAlign: "middle" as const };

  const label = (text: string, child: ReactNode, width?: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, width }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: TEXT_MUTED }}>{text}</div>
      {child}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: TEXT_MUTED, fontSize: 14 }}>
          Contract value <strong style={{ color: NAVY }}>{money(saved.contractValue, saved.currency)}</strong>
          {" · "}Invoiced <strong style={{ color: NAVY }}>{money(totals.invoiced, saved.currency)}</strong>
          {" · "}Paid <strong style={{ color: NAVY }}>{money(totals.paid, saved.currency)}</strong>
          {totals.percentTotal !== null && (
            <>
              {" · "}Milestones cover{" "}
              <strong style={{ color: totals.percentTotal === 100 ? NAVY : "#9A4B00" }}>{totals.percentTotal}%</strong> of the contract
            </>
          )}
        </span>
        <span style={{ flex: 1 }} />
        {editing ? (
          <>
            <button type="button" style={primaryButton} disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" style={secondaryButton} disabled={pending} onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" style={secondaryButton} onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} style={{ padding: "10px 14px", borderRadius: 8, fontSize: 14, background: message.kind === "ok" ? "#D8F5E3" : "#FCE9E7", color: message.kind === "ok" ? "#047857" : "#8C1D18" }}>
          {message.text}
        </div>
      )}

      {editing && (
        <section style={{ ...cardStyle, padding: "14px 20px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          {label(
            "Currency",
            <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>,
          )}
          {label(
            "Contract amount for payments",
            <input
              aria-label="Contract amount for payments"
              inputMode="decimal"
              value={base}
              placeholder={saved.mondayValue === null ? "" : saved.mondayValue.toLocaleString("en-US")}
              onChange={(e) => setBase(e.target.value)}
              style={{ ...inputStyle, width: 200 }}
            />,
          )}
        </section>
      )}

      {/* ---------------- Milestones ---------------- */}
      <section style={cardStyle}>
        <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 17, color: NAVY }}>Milestones</h2>
          {editing && (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <select aria-label="Milestone to add" value={chosenLabel} onChange={(e) => setAddPick(e.target.value)} style={inputStyle}>
                {unusedLabels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value="">Other…</option>
              </select>
              <button type="button" style={secondaryButton} disabled={milestones.length >= 12} onClick={() => {
                  setMilestones((list) => [...list, keyed(emptyMilestone(chosenLabel || `Milestone ${list.length + 1}`))]);
                  setAddPick(null);
                }}>
                + Add milestone
              </button>
            </span>
          )}
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 20px 20px" }}>
            {milestones.length === 0 && <div style={{ color: TEXT_MUTED }}>No milestones yet. Add the first one above.</div>}
            {milestones.map(({ key, data: m }) => {
              const calc = milestoneAmount({ percent: num(m.percent), amountOverride: null }, num(base) ?? saved.mondayValue);
              const invoiced = m.status === "INVOICE_SENT" || m.status === "PAYMENT_RECEIVED";
              return (
                <div key={key} style={{ border: `1px solid ${ROW_DIVIDER}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    {label("Name", <input aria-label="Milestone name" value={m.label} maxLength={60} onChange={(e) => setMilestone(key, { label: e.target.value })} style={{ ...inputStyle, width: 190 }} />)}
                    {label("% of contract", <input aria-label={`Percent of ${m.label}`} inputMode="decimal" value={m.percent} onChange={(e) => setMilestone(key, { percent: e.target.value })} style={{ ...inputStyle, width: 90 }} />)}
                    {label(
                      "Amount",
                      <input
                        aria-label={`Amount of ${m.label}`}
                        inputMode="decimal"
                        value={m.amountOverride}
                        placeholder={calc === null ? "" : money(calc, currency)}
                        onChange={(e) => setMilestone(key, { amountOverride: e.target.value })}
                        style={{ ...inputStyle, width: 150 }}
                      />,
                    )}
                    {label(
                      "Triggered by item",
                      <select aria-label={`Item that triggers ${m.label}`} value={m.linkedSubStageId} onChange={(e) => setMilestone(key, { linkedSubStageId: e.target.value })} style={{ ...inputStyle, maxWidth: 260 }}>
                        <option value=""></option>
                        {saved.items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.phaseLabel} · {i.name}
                          </option>
                        ))}
                      </select>,
                    )}
                    <span style={{ flex: 1 }} />
                    <button type="button" style={secondaryButton} aria-label={`Remove ${m.label}`} onClick={() => setMilestones((list) => list.filter((x) => x.key !== key))}>
                      Remove
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                    {label("Due date", <DateField ariaLabel={`Due date of ${m.label}`} value={m.dueDate || null} onCommit={(c) => setMilestone(key, { dueDate: c.date ?? "" })} />)}
                    {label(
                      "Status",
                      <ColorSelect
                        ariaLabel={`Status of ${m.label}`}
                        value={m.status}
                        options={SETTABLE_MILESTONE_STATUSES.map((s) => MILESTONE_STATUS[s])}
                        onChange={(v) => setMilestone(key, { status: v || "NOT_DUE" })}
                      />,
                    )}
                    {invoiced && label("Invoice sent", <DateField ariaLabel={`Invoice sent date of ${m.label}`} value={m.invoiceSentDate || null} onCommit={(c) => setMilestone(key, { invoiceSentDate: c.date ?? "" })} />)}
                    {m.status === "PAYMENT_RECEIVED" && label("Paid on", <DateField ariaLabel={`Paid date of ${m.label}`} value={m.paidDate || null} onCommit={(c) => setMilestone(key, { paidDate: c.date ?? "" })} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : saved.milestones.length === 0 ? (
          <div style={{ padding: "0 20px 20px", color: TEXT_MUTED }}>No milestones yet. Press Edit to add them.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
              <thead>
                <tr style={{ background: NAVY, color: "#fff" }}>
                  {["Milestone", "%", "Amount", "Triggered by", "Due", "Status", "Invoice sent", "Paid"].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viewMilestones.map((m) => (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, background: m.id === upcoming ? "#FFF7E6" : undefined }}>
                    <td style={{ ...td, fontWeight: 700, color: NAVY }}>
                      {m.label}
                      {m.optional && <span style={{ fontWeight: 400, color: TEXT_MUTED }}> (optional)</span>}
                      {m.id === upcoming && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, background: "#F28C28", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>Upcoming</span>}
                    </td>
                    <td style={td}>{m.percent === null ? DASH : `${m.percent}%`}</td>
                    <td style={td}>{m.amount === null ? DASH : money(m.amount, saved.currency)}</td>
                    <td style={{ ...td, color: m.linkedName ? undefined : TEXT_MUTED }} title={m.linkedStatus ? `Item status: ${m.linkedStatus}` : undefined}>
                      {m.linkedName ?? "—"}
                    </td>
                    <td style={td}>{m.dueDate ? fmt(m.dueDate) : DASH}</td>
                    <td style={td}>
                      <ChoicePill choice={MILESTONE_STATUS[m.effective]} />
                    </td>
                    <td style={td}>{m.invoiceSentDate ? fmt(m.invoiceSentDate) : DASH}</td>
                    <td style={td}>{m.paidDate ? fmt(m.paidDate) : DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Change orders ---------------- */}
      <section style={cardStyle}>
        <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: NAVY }}>Change orders</h2>
          {editing && (
            <button
              type="button"
              style={secondaryButton}
              aria-label="Add a change order"
              onClick={() => setOrders((list) => [...list, keyed<ChangeOrderInput>({ id: "", reason: "", status: "SENT", amount: "", dateSent: "", invoicedDate: "", invoiceStatus: "", paymentTermsDays: "", fileLink: "" })])}
            >
              +
            </button>
          )}
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 20px 20px" }}>
            {orders.length === 0 && <div style={{ color: TEXT_MUTED }}>No change orders. Press + to add one.</div>}
            {orders.map(({ key, data: o }, index) => (
              <div key={key} style={{ border: `1px solid ${ROW_DIVIDER}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 320px" }}>
                    {label("Reason", <textarea aria-label={`Reason for change order ${index + 1}`} rows={2} value={o.reason} maxLength={500} onChange={(e) => setOrder(key, { reason: e.target.value })} style={{ ...inputStyle, width: "100%", fontFamily: "inherit", resize: "vertical" }} />)}
                  </div>
                  {label("Amount", <input aria-label={`Amount of change order ${index + 1}`} inputMode="decimal" value={o.amount} onChange={(e) => setOrder(key, { amount: e.target.value })} style={{ ...inputStyle, width: 150 }} />)}
                  <button type="button" style={secondaryButton} aria-label={`Remove change order ${index + 1}`} onClick={() => setOrders((list) => list.filter((x) => x.key !== key))}>
                    Remove
                  </button>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {label("Status", <ColorSelect ariaLabel={`Status of change order ${index + 1}`} value={o.status} options={CHANGE_ORDER_STATUS} onChange={(v) => setOrder(key, { status: v || "SENT" })} />)}
                  {label("Date sent", <DateField ariaLabel={`Date sent of change order ${index + 1}`} value={o.dateSent || null} onCommit={(c) => setOrder(key, { dateSent: c.date ?? "" })} />)}
                  {label("Invoiced date", <DateField ariaLabel={`Invoiced date of change order ${index + 1}`} value={o.invoicedDate || null} onCommit={(c) => setOrder(key, { invoicedDate: c.date ?? "" })} />)}
                  {label("Payment terms (days)", <input aria-label={`Payment terms in days of change order ${index + 1}`} inputMode="numeric" placeholder="e.g. 10" value={o.paymentTermsDays} onChange={(e) => setOrder(key, { paymentTermsDays: e.target.value })} style={{ ...inputStyle, width: 110 }} />)}
                  {label("Due date", <span style={{ padding: "7px 0", fontSize: 14 }}>{(() => { const due = changeOrderDueDate(o.invoicedDate || null, num(o.paymentTermsDays)); return due ? fmt(due) : <span style={{ color: TEXT_MUTED }}>Set the invoiced date and terms</span>; })()}</span>)}
                  {label("Invoice status", <ColorSelect ariaLabel={`Invoice status of change order ${index + 1}`} value={o.invoiceStatus} options={CHANGE_ORDER_INVOICE_STATUS} onChange={(v) => setOrder(key, { invoiceStatus: v })} />)}
                </div>
                {label("File link", <input aria-label={`File link of change order ${index + 1}`} placeholder="Paste the SharePoint / OneDrive link to the change order" value={o.fileLink} onChange={(e) => setOrder(key, { fileLink: e.target.value })} style={{ ...inputStyle, width: "100%" }} />)}
              </div>
            ))}
          </div>
        ) : saved.changeOrders.length === 0 ? (
          <div style={{ padding: "0 20px 20px", color: TEXT_MUTED }}>No change orders.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
              <thead>
                <tr style={{ background: NAVY, color: "#fff" }}>
                  {["Reason", "Amount", "Status", "Date sent", "Invoiced", "Terms", "Due date", "Invoice status", "File"].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {saved.changeOrders.map((c) => {
                  const shown = changeOrderDisplay(c, todayIso);
                  return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                    <td style={{ ...td, maxWidth: 360, whiteSpace: "pre-wrap" }}>{c.reason}</td>
                    <td style={td}>{c.amount === null ? DASH : money(c.amount, saved.currency)}</td>
                    <td style={td}>
                      <ChoicePill choice={CHANGE_ORDER_STATUS.find((s) => s.value === shown.status) ?? null} />
                    </td>
                    <td style={td}>{c.dateSent ? fmt(c.dateSent) : DASH}</td>
                    <td style={td}>{c.invoicedDate ? fmt(c.invoicedDate) : DASH}</td>
                    <td style={td}>{formatTerms(c.paymentTermsDays) ?? DASH}</td>
                    <td style={{ ...td, color: shown.overdue ? "#8C1D18" : undefined, fontWeight: shown.overdue ? 600 : 400 }}>{shown.dueDate ? fmt(shown.dueDate) : DASH}</td>
                    <td style={td}>
                      <ChoicePill choice={CHANGE_ORDER_INVOICE_STATUS.find((s) => s.value === shown.invoiceStatus) ?? null} />
                    </td>
                    <td style={td}>
                      {c.fileLink ? (
                        <a href={c.fileLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
                          Open
                        </a>
                      ) : (
                        DASH
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        These payments also appear on the{" "}
        <Link href={`/projects/${projectId}`} style={{ color: NAVY, fontWeight: 600 }}>
          {projectName}
        </Link>{" "}
        project page.
      </div>
    </div>
  );
}
