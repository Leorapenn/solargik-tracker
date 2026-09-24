"use client";

import { useState, useTransition } from "react";
import {
  dismissReviewItem,
  resolveWithExistingCustomer,
  resolveWithNewCustomer,
} from "@/server/actions/resolveImportReviewItem";
import { BORDER, NAVY } from "@/lib/theme";

const fieldStyle = {
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: "0.35rem 0.5rem",
  fontSize: "0.85rem",
};

export function ResolveReviewItem({
  reviewItemId,
  customers,
}: {
  reviewItemId: string;
  customers: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "existing") {
          if (!selectedCustomerId) {
            setError("Choose a customer.");
            return;
          }
          await resolveWithExistingCustomer(reviewItemId, selectedCustomerId);
        } else {
          await resolveWithNewCustomer(reviewItemId, newName);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function handleDismiss() {
    startTransition(() => {
      dismissReviewItem(reviewItemId);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: 260 }}>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "existing" | "new")}
          disabled={isPending}
          style={fieldStyle}
        >
          <option value="existing">Link to existing customer</option>
          <option value="new">Create new customer</option>
        </select>

        {mode === "existing" ? (
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            disabled={isPending || customers.length === 0}
            style={fieldStyle}
          >
            {customers.length === 0 && <option value="">No customers yet</option>}
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            placeholder="New customer name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isPending}
            style={fieldStyle}
          />
        )}

        <button
          type="button"
          onClick={handleResolve}
          disabled={isPending}
          style={{
            backgroundColor: NAVY,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "0.4rem 0.75rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          Resolve
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={isPending}
          style={{
            backgroundColor: "transparent",
            color: NAVY,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: "0.4rem 0.75rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          Dismiss
        </button>
      </div>
      {error && <span style={{ color: "#df2f4a", fontSize: "0.85rem" }}>{error}</span>}
    </div>
  );
}
