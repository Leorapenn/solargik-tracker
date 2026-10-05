import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageAuth } from "@/lib/auth";
import { ResolveReviewItem } from "@/components/ResolveReviewItem";
import { SortTh } from "@/components/SortTh";
import { parseSort, sortRows } from "@/lib/sort";
import { BORDER, NAVY, TEXT_MUTED, pageStyle, pageTitleStyle } from "@/lib/theme";

export const dynamic = "force-dynamic";

const NO_CUSTOMER_LINKED = "(no customer linked)";

type Params = Record<string, string | string[] | undefined>;

export default async function ImportReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePageAuth();
  const params = await searchParams;
  const [found, customers] = await Promise.all([
    prisma.importReviewItem.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  type Item = (typeof found)[number];
  const accessors = {
    item: (i: Item) => i.itemName,
    ref: (i: Item) => i.rawCustomerRef,
    reason: (i: Item) => i.reason,
    flagged: (i: Item) => i.createdAt,
  };
  const sort = parseSort(params, Object.keys(accessors), { key: "flagged", dir: "desc" });
  const items = sortRows(found, accessors, sort);
  const th = { current: sort, basePath: "/import", params, style: headerCellStyle };

  return (
    <main style={pageStyle}>
      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        <Link href="/customers" style={{ color: NAVY, fontWeight: 600 }}>
          Customers
        </Link>{" "}
        › Import review
      </div>
      <h1 style={{ ...pageTitleStyle, marginTop: -8 }}>Import Review</h1>
      <p style={{ color: TEXT_MUTED, marginTop: -12, maxWidth: 760 }}>
        Items from the monday.com importer whose customer could not be resolved via{" "}
        <code>Customer.name</code> or <code>CustomerAlias</code>. No customer or project was created for
        these. Resolving a row creates the alias/customer but does not retroactively import the project —
        re-run the importer afterwards to pick it up.
      </p>

      {items.length === 0 ? (
        <p style={{ marginTop: "1.5rem" }}>Nothing to review.</p>
      ) : (
        <div
          style={{
            marginTop: "1.5rem",
            background: "#fff",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ backgroundColor: NAVY }}>
                  <SortTh label="Item" sortKey="item" {...th} />
                  <SortTh label="Raw customer reference" sortKey="ref" {...th} />
                  <SortTh label="Reason" sortKey="reason" {...th} />
                  <SortTh label="Flagged" sortKey="flagged" {...th} />
                  <th style={headerCellStyle}>Resolve</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ ...cellStyle, fontWeight: 600, color: NAVY }}>{item.itemName}</td>
                    <td style={cellStyle}>{item.rawCustomerRef}</td>
                    <td style={{ ...cellStyle, color: TEXT_MUTED }}>{item.reason}</td>
                    <td style={{ ...cellStyle, color: TEXT_MUTED, whiteSpace: "nowrap" }}>
                      {item.createdAt.toLocaleString()}
                    </td>
                    <td style={cellStyle}>
                      {item.rawCustomerRef === NO_CUSTOMER_LINKED ? (
                        <span style={{ color: TEXT_MUTED, fontSize: "0.85rem" }}>
                          No customer link at all on monday.com — fix the link on the board, not here.
                        </span>
                      ) : (
                        <ResolveReviewItem reviewItemId={item.id} customers={customers} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

const headerCellStyle: CSSProperties = {
  padding: "0.65rem 1rem",
  textAlign: "left",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "#fff",
};

const cellStyle: CSSProperties = {
  padding: "0.65rem 1rem",
  textAlign: "left",
  verticalAlign: "top",
  fontSize: "0.9rem",
};
