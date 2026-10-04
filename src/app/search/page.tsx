import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, pageStyle, pageSubtitleStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePageAuth();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);

  const [customers, projects] = q
    ? await Promise.all([
        prisma.customer.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { aliases: { some: { alias: { contains: q, mode: "insensitive" } } } },
            ],
          },
          orderBy: { name: "asc" },
          take: 50,
          include: { _count: { select: { projects: true } } },
        }),
        prisma.project.findMany({
          where: { name: { contains: q, mode: "insensitive" } },
          orderBy: { name: "asc" },
          take: 100,
          include: { customer: { select: { name: true } } },
        }),
      ])
    : [[], []];

  return (
    <main style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Search</h1>
        <div style={pageSubtitleStyle}>
          {q ? (
            <>
              {customers.length + projects.length} result{customers.length + projects.length === 1 ? "" : "s"} for “{q}”
            </>
          ) : (
            "Type a customer or project name in the box at the top."
          )}
        </div>
      </div>

      {q && (
        <>
          <Section title={`Customers (${customers.length})`}>
            {customers.map((customer) => (
              <Row
                key={customer.id}
                href={`/customers/${customer.id}`}
                primary={customer.name}
                secondary={`${customer._count.projects} project${customer._count.projects === 1 ? "" : "s"}`}
              />
            ))}
          </Section>
          <Section title={`Projects (${projects.length})`}>
            {projects.map((project) => (
              <Row key={project.id} href={`/projects/${project.id}`} primary={project.name} secondary={project.customer.name} />
            ))}
          </Section>
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div style={cardStyle}>
      <div style={{ background: NAVY, color: "#fff", ...heading }}>{title}</div>
      {items.length === 0 || (items.length === 1 && !items[0]) ? (
        <div style={{ padding: "16px 20px", color: TEXT_MUTED }}>No matches.</div>
      ) : (
        children
      )}
    </div>
  );
}

function Row({ href, primary, secondary }: { href: string; primary: string; secondary: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 20px",
        borderBottom: `1px solid ${ROW_DIVIDER}`,
      }}
    >
      <span style={{ fontWeight: 700, color: NAVY }}>{primary}</span>
      <span style={{ color: TEXT_MUTED, fontSize: 14 }}>{secondary}</span>
    </Link>
  );
}

const heading: CSSProperties = {
  padding: "13px 20px",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
