import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { phaseSpread, progressScore } from "@/lib/phaseSpread";
import { parseSort, sortRows } from "@/lib/sort";
import { StatCard } from "@/components/StatCard";
import { SpreadBar } from "@/components/SpreadBar";
import { SortLink } from "@/components/SortTh";
import { SortSummary } from "@/components/SortSummary";
import { ImportanceSelect } from "@/components/ImportanceSelect";
import { updateCustomerImportance } from "@/server/actions/updateCustomerImportance";
import {
  NAVY,
  ORANGE,
  ROW_DIVIDER,
  TEXT_BODY,
  TEXT_MUTED,
  cardStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from "@/lib/theme";

export const dynamic = "force-dynamic";

const GRID = "2.4fr 0.9fr 1.7fr 1.2fr 1.9fr 56px";
const IMPORTANCE_RANK = { NORMAL: 0, SEMI_STRATEGIC: 1, STRATEGIC: 2 } as const;

type Params = Record<string, string | string[] | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;

  const [customers, reviewCount, blockedPhaseCount] = await Promise.all([
    prisma.customer.findMany({
      include: {
        projects: { select: { phases: { select: { name: true, status: true } } } },
        _count: { select: { aliases: true } },
      },
    }),
    prisma.importReviewItem.count(),
    prisma.phase.count({ where: { status: "BLOCKED" } }),
  ]);

  const built = customers.map((customer) => {
    const blocked = customer.projects.reduce(
      (sum, project) => sum + project.phases.filter((phase) => phase.status === "BLOCKED").length,
      0,
    );
    return {
      customer,
      projectCount: customer.projects.length,
      spread: phaseSpread(customer.projects),
      progress: progressScore(customer.projects),
      blocked,
      flags: customer._count.aliases + (blocked > 0 ? 1 : 0),
    };
  });

  type Row = (typeof built)[number];
  const accessors = {
    customer: (r: Row) => r.customer.name,
    projects: (r: Row) => r.projectCount,
    spread: (r: Row) => r.progress,
    importance: (r: Row) => IMPORTANCE_RANK[r.customer.importance],
    flags: (r: Row) => r.flags,
  };
  const sort = parseSort(params, Object.keys(accessors), { key: "projects", dir: "desc" });
  const rows = sortRows(
    [...built].sort((a, b) => a.customer.name.localeCompare(b.customer.name)),
    accessors,
    sort,
  );

  const projectTotal = rows.reduce((sum, row) => sum + row.projectCount, 0);
  const sortProps = { current: sort, basePath: "/customers", params };

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Customers</h1>
        <div style={pageSubtitleStyle}>All customers and their projects, imported from monday.com</div>
      </div>

      {reviewCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 20px",
            background: "#FEF6E7",
            border: "1px solid #F0C069",
            borderRadius: 10,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A5A00" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <div style={{ flexGrow: 1, fontSize: 14, color: "#7A4E00", lineHeight: "20px" }}>
            <strong style={{ color: "#5E3C00" }}>
              {reviewCount} {reviewCount === 1 ? "project has" : "projects have"} no customer assigned.
            </strong>{" "}
            They couldn&apos;t be imported until their customer is resolved.
          </div>
          <Link href="/import" style={{ fontSize: 14, fontWeight: 700, color: "#8A5A00", padding: "12px 16px" }}>
            Review unlinked
          </Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        <StatCard label="Customers" value={rows.length} />
        <StatCard label="Projects" value={projectTotal} />
        <StatCard
          label="Missing customer link"
          value={reviewCount}
          accent={reviewCount > 0 ? "#B3261E" : undefined}
          href="/import"
        />
        <StatCard label="Blocked phases" value={blockedPhaseCount} accent={blockedPhaseCount > 0 ? "#B3261E" : undefined} />
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 900 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                background: NAVY,
                color: "#fff",
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <div style={headerCell}>
                <SortLink label="Customer" sortKey="customer" {...sortProps} />
              </div>
              <div style={headerCell}>
                <SortLink label="Projects" sortKey="projects" {...sortProps} />
              </div>
              <div style={headerCell}>
                <SortLink label="Phase spread" sortKey="spread" {...sortProps} />
              </div>
              <div style={headerCell}>
                <SortLink label="Importance" sortKey="importance" {...sortProps} />
              </div>
              <div style={headerCell}>
                <SortLink label="Flags" sortKey="flags" {...sortProps} />
              </div>
              <div style={headerCell} />
            </div>

            {rows.length === 0 && (
              <div style={{ padding: 24, color: TEXT_MUTED }}>No customers yet — run the monday.com importer.</div>
            )}

            {rows.map(({ customer, projectCount, spread, blocked }, index) => (
              <div
                key={customer.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  alignItems: "center",
                  borderBottom: `1px solid ${ROW_DIVIDER}`,
                  background: index % 2 === 1 ? "#FBFCFE" : "#fff",
                }}
              >
                <div style={{ ...bodyCell, fontWeight: 700 }}>
                  <Link href={`/customers/${customer.id}`} style={{ color: NAVY }}>
                    {customer.name}
                  </Link>
                </div>
                <div style={{ ...bodyCell, color: TEXT_BODY }}>{projectCount}</div>
                <div style={bodyCell}>
                  <SpreadBar segments={spread} />
                </div>
                <div style={bodyCell}>
                  <ImportanceSelect
                    label={customer.name}
                    value={customer.importance}
                    onChange={updateCustomerImportance.bind(null, customer.id)}
                  />
                </div>
                <div style={{ ...bodyCell, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {customer._count.aliases > 0 && (
                    <span style={chip("#7A4E00", "#FEF6E7")}>
                      {customer._count.aliases} name variant{customer._count.aliases === 1 ? "" : "s"}
                    </span>
                  )}
                  {blocked > 0 && <span style={chip("#8C1D18", "#FCE9E7")}>{blocked} blocked</span>}
                  {customer._count.aliases === 0 && blocked === 0 && <span style={{ color: TEXT_MUTED }}>—</span>}
                </div>
                <div style={bodyCell}>
                  <Link
                    href={`/customers/${customer.id}`}
                    aria-label={`Open ${customer.name}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, margin: "-12px 0 -12px -12px" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEXT_MUTED} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 20px", fontSize: 13, color: TEXT_MUTED, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <span>
            Showing {rows.length} of {rows.length} customers
          </span>
          <span>
            Phase spread: <Swatch color={NAVY} /> all done · <Swatch color="#2F4C8F" /> in progress ·{" "}
            <Swatch color={ORANGE} /> blocked · <Swatch color="#E4E6EC" /> not started
          </span>
          <SortSummary
            basePath="/customers"
            params={params}
            current={sort}
            labels={{ customer: "Customer", projects: "Projects", spread: "Phase spread", importance: "Importance", flags: "Flags" }}
          />
        </div>
      </div>
    </main>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color, verticalAlign: "middle" }}
    />
  );
}

function chip(color: string, background: string): CSSProperties {
  return { fontSize: 13, fontWeight: 700, color, background, borderRadius: 20, padding: "5px 12px" };
}

const headerCell: CSSProperties = { padding: "15px 20px" };
const bodyCell: CSSProperties = { padding: "16px 20px", fontSize: 15 };
