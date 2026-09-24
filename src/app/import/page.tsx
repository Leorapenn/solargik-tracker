import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ImportReviewPage() {
  const items = await prisma.importReviewItem.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 960, margin: "0 auto" }}>
      <h1>Import Review</h1>
      <p>
        Items from the monday.com importer whose customer could not be resolved via{" "}
        <code>Customer.name</code> or <code>CustomerAlias</code>. No customer or project was created for
        these — re-run the importer after fixing the alias/name to pick them up.
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
              <th style={cellStyle}>Board</th>
              <th style={cellStyle}>monday.com item id</th>
              <th style={cellStyle}>Flagged</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle}>{item.itemName}</td>
                <td style={cellStyle}>{item.rawCustomerRef}</td>
                <td style={cellStyle}>{item.reason}</td>
                <td style={cellStyle}>{item.boardId}</td>
                <td style={cellStyle}>{item.mondayItemId}</td>
                <td style={cellStyle}>{item.createdAt.toLocaleString()}</td>
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
