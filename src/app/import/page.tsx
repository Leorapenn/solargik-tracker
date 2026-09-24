import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { ResolveReviewItem } from "@/components/ResolveReviewItem";
import { BORDER, NAVY, PAGE_BG, TEXT_MUTED } from "@/lib/theme";

export const dynamic = "force-dynamic";

const NO_CUSTOMER_LINKED = "(no customer linked)";

export default async function ImportReviewPage() {
  const [items, customers] = await Promise.all([
    prisma.importReviewItem.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto", background: PAGE_BG, flex: 1 }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: NAVY }}>Import Review</h1>
      <p style={{ color: TEXT_MUTED, marginTop: "0.25rem", maxWidth: 760 }}>
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
                  <th style={headerCellStyle}>Item</th>
                  <th style={headerCellStyle}>Raw customer reference</th>
                  <th style={headerCellStyle}>Reason</th>
                  <th style={headerCellStyle}>Flagged</th>
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
