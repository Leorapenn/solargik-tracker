import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { toDateInputValue, todayInAppTz, formatDate, parseDateInput } from "@/lib/dates";
import { MILESTONE_STATUS, effectiveStatus, milestoneAmount, milestoneTotals, money, upcomingMilestoneId, type MilestoneStatus } from "@/lib/payments";
import { parseSort, sortRows } from "@/lib/sort";
import { ChoicePill } from "@/components/ColorSelect";
import { SortSummary } from "@/components/SortSummary";
import { SortTh } from "@/components/SortTh";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, pageStyle, pageSubtitleStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const STATUS_RANK: Record<MilestoneStatus, number> = { OVERDUE: 0, NOT_DUE: 1, INVOICE_SENT: 2, PAYMENT_RECEIVED: 3 };
const SORT_LABELS = { project: "Project", customer: "Customer", contract: "Contract value", paid: "Paid", next: "Next milestone", due: "Due", status: "Status", orders: "Open change orders" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const todayIso = toDateInputValue(todayInAppTz());

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      contractValue: true,
      paymentCurrency: true,
      paymentBase: true,
      customer: { select: { name: true } },
      milestones: { orderBy: { order: "asc" }, select: { id: true, label: true, order: true, percent: true, amountOverride: true, status: true, dueDate: true, linkedSubStage: { select: { status: true } } } },
      changeOrders: { select: { status: true } },
    },
  });

  const rows = projects.map((p) => {
    // the amount the milestone percentages apply to: the typed payment base, else the monday.com contract value
    const baseValue = p.paymentBase ?? p.contractValue;
    const contract = baseValue === null ? null : Number(baseValue.toString());
    const milestones = p.milestones.map((m) => ({
      id: m.id,
      label: m.label,
      order: m.order,
      percent: m.percent === null ? null : Number(m.percent.toString()),
      amountOverride: m.amountOverride === null ? null : Number(m.amountOverride.toString()),
      status: m.status,
      dueDate: m.dueDate ? toDateInputValue(m.dueDate) : null,
      linkedStatus: m.linkedSubStage?.status ?? null,
    }));
    const upcomingId = upcomingMilestoneId(milestones);
    const next = milestones.find((m) => m.id === upcomingId) ?? null;
    return {
      id: p.id,
      name: p.name,
      customer: p.customer.name,
      currency: p.paymentCurrency,
      contract,
      paid: milestoneTotals(milestones, contract).paid,
      hasMilestones: milestones.length > 0,
      next,
      nextAmount: next ? milestoneAmount(next, contract) : null,
      nextStatus: next ? effectiveStatus(next, todayIso) : null,
      openOrders: p.changeOrders.filter((c) => c.status !== "COMPLETE").length,
    };
  });

  type Row = (typeof rows)[number];
  const accessors = {
    project: (r: Row) => r.name,
    customer: (r: Row) => r.customer,
    contract: (r: Row) => r.contract,
    paid: (r: Row) => (r.hasMilestones ? r.paid : null),
    next: (r: Row) => r.next?.label ?? null,
    due: (r: Row) => r.next?.dueDate ?? null,
    status: (r: Row) => (r.nextStatus ? STATUS_RANK[r.nextStatus] : null),
    orders: (r: Row) => r.openOrders,
  };
  const sort = parseSort(params, Object.keys(accessors), { key: "status", dir: "asc" });
  const sorted = sortRows(rows, accessors, sort);
  const th = { current: sort, basePath: "/payments", params, style: headCell };

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Payments</h1>
        <div style={pageSubtitleStyle}>Payment milestones and change orders for every project. Open a project to record invoices and payments.</div>
      </div>

      <div style={cardStyle}>
        <SortSummary basePath="/payments" params={params} current={sort} labels={SORT_LABELS} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                <SortTh label="Project" sortKey="project" {...th} />
                <SortTh label="Customer" sortKey="customer" {...th} />
                <SortTh label="Contract value" sortKey="contract" {...th} />
                <SortTh label="Paid" sortKey="paid" {...th} />
                <SortTh label="Next milestone" sortKey="next" {...th} />
                <SortTh label="Due" sortKey="due" {...th} />
                <SortTh label="Status" sortKey="status" {...th} />
                <SortTh label="Open change orders" sortKey="orders" {...th} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                  <td style={{ ...bodyCell, fontWeight: 700 }}>
                    <Link href={`/payments/${r.id}`} style={{ color: NAVY }}>
                      {r.name}
                    </Link>
                  </td>
                  <td style={{ ...bodyCell, color: TEXT_MUTED }}>{r.customer}</td>
                  <td style={bodyCell}>{money(r.contract, r.currency)}</td>
                  <td style={bodyCell}>{r.hasMilestones ? money(r.paid, r.currency) : <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                  <td style={bodyCell}>
                    {r.next ? (
                      <>
                        {r.next.label} <span style={{ color: TEXT_MUTED }}>· {money(r.nextAmount, r.currency)}</span>
                      </>
                    ) : (
                      <span style={{ color: TEXT_MUTED }}>{r.hasMilestones ? "None active" : "No milestones yet"}</span>
                    )}
                  </td>
                  <td style={bodyCell}>{r.next?.dueDate ? formatDate(parseDateInput(r.next.dueDate)) : <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                  <td style={bodyCell}>{r.nextStatus ? <ChoicePill choice={MILESTONE_STATUS[r.nextStatus]} /> : <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                  <td style={bodyCell}>{r.openOrders > 0 ? r.openOrders : <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...bodyCell, color: TEXT_MUTED }}>
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

const headCell: CSSProperties = { padding: "15px 18px", textAlign: "left", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" };
const bodyCell: CSSProperties = { padding: "13px 18px", fontSize: 14.5, verticalAlign: "middle" };
