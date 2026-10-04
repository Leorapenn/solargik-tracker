import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { phaseSpread } from "@/lib/phaseSpread";
import { SpreadBar } from "@/components/SpreadBar";
import {
  NAVY,
  ORANGE,
  ROW_DIVIDER,
  TEXT_MUTED,
  cardStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
} from "@/lib/theme";

export const dynamic = "force-dynamic";

const IMPORTANCE_LABELS = { NORMAL: "Normal", SEMI_STRATEGIC: "Semi-Strategic", STRATEGIC: "Strategic" } as const;

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAuth();
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      aliases: { orderBy: { alias: "asc" } },
      projects: { orderBy: { name: "asc" }, include: { phases: { select: { name: true, status: true } } } },
    },
  });
  if (!customer) notFound();

  const totalContract = customer.projects.reduce((sum, p) => sum + (p.contractValue ? Number(p.contractValue) : 0), 0);
  const totalCapacity = customer.projects.reduce((sum, p) => sum + (p.capacityMw ? Number(p.capacityMw) : 0), 0);
  const withoutContract = customer.projects.filter((p) => p.contractValue === null).length;
  const strategic = customer.importance === "STRATEGIC";

  return (
    <main style={pageStyle}>
      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        <Link href="/customers" style={{ color: NAVY, fontWeight: 600 }}>
          Customers
        </Link>{" "}
        › {customer.name}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={pageTitleStyle}>{customer.name}</h1>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 20,
              padding: "5px 12px",
              color: strategic ? "#fff" : NAVY,
              background: strategic ? NAVY : "#E4E6EC",
            }}
          >
            {IMPORTANCE_LABELS[customer.importance]}
          </span>
        </div>
        <div style={pageSubtitleStyle}>
          {customer.projects.length} project{customer.projects.length === 1 ? "" : "s"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
        <div style={{ ...cardStyle, gridColumn: "span 2" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
              <thead>
                <tr style={{ background: NAVY, color: "#fff" }}>
                  {["Project", "Phase spread", "Capacity (MW)", "Contract value", ""].map((heading) => (
                    <th key={heading} style={headCell}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customer.projects.map((project) => (
                  <tr key={project.id} style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                    <td style={{ ...bodyCell, fontWeight: 700 }}>
                      <Link href={`/projects/${project.id}`} style={{ color: NAVY }}>
                        {project.name}
                      </Link>
                    </td>
                    <td style={{ ...bodyCell, width: 220 }}>
                      <SpreadBar segments={phaseSpread([project])} />
                    </td>
                    <td style={bodyCell}>{project.capacityMw ? Number(project.capacityMw).toFixed(2) : "—"}</td>
                    <td style={bodyCell}>
                      {project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : "—"}
                    </td>
                    <td style={{ ...bodyCell, textAlign: "right" }}>
                      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`} style={{ color: TEXT_MUTED }}>
                        ›
                      </Link>
                    </td>
                  </tr>
                ))}
                {customer.projects.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...bodyCell, color: TEXT_MUTED }}>
                      No projects imported for this customer yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "12px 20px", fontSize: 13, color: TEXT_MUTED }}>
            Showing {customer.projects.length} of {customer.projects.length} projects
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SideCard title="Commercial">
            <Row label="Contract value" value={totalContract > 0 ? `$${totalContract.toLocaleString()}` : "—"} />
            <Row label="Capacity" value={totalCapacity > 0 ? `${totalCapacity.toFixed(2)} MW` : "—"} />
            <Row
              label="Pre-contract projects"
              value={String(withoutContract)}
              hint="No contract value in the Control Table yet"
            />
          </SideCard>

          <SideCard title="Name variants">
            {customer.aliases.length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No alternate spellings recorded.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {customer.aliases.map((alias) => (
                  <li key={alias.id} style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} />
                    {alias.alias}
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
        </div>
      </div>
    </main>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: NAVY }}>
        {title}
      </div>
      <div style={{ width: 28, height: 3, borderRadius: 2, background: ORANGE, margin: "8px 0 14px" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
      <span style={{ color: TEXT_MUTED }}>{label}</span>
      <span style={{ fontWeight: 700, color: NAVY }}>{value}</span>
    </div>
  );
}

const headCell: CSSProperties = {
  padding: "15px 20px",
  textAlign: "left",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const bodyCell: CSSProperties = { padding: "14px 20px", fontSize: 15, verticalAlign: "middle" };
