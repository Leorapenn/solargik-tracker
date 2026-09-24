import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { ResolveReviewItem } from "@/components/ResolveReviewItem";

export const dynamic = "force-dynamic";

const NO_CUSTOMER_LINKED = "(no customer linked)";

export default async function ImportReviewPage() {
  const [items, customers] = await Promise.all([
    prisma.importReviewItem.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1>Import Review</h1>
      <p>
        Items from the monday.com importer whose customer could not be resolved via{" "}
        <code>Customer.name</code> or <code>CustomerAlias</code>. No customer or project was created for
        these. Resolving a row creates the alias/customer but does not retroactively import the
        project — re-run the importer afterwards to pick it up.
      </p>

      {items.length === 0 ? (
        <p>Nothing to review.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "1rem" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Item</th>
              <th style={cellStyle}>Raw customer reference</th>
              <th style={cellStyle}>Reason</th>
              <th style={cellStyle}>Flagged</th>
              <th style={cellStyle}>Resolve</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle}>{item.itemName}</td>
                <td style={cellStyle}>{item.rawCustomerRef}</td>
                <td style={cellStyle}>{item.reason}</td>
                <td style={cellStyle}>{item.createdAt.toLocaleString()}</td>
                <td style={cellStyle}>
                  {item.rawCustomerRef === NO_CUSTOMER_LINKED ? (
                    <span style={{ color: "#888" }}>
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
      )}
    </main>
  );
}

const cellStyle: CSSProperties = {
  border: "1px solid #ddd",
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  verticalAlign: "top",
};
