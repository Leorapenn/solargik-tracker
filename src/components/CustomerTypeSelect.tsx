"use client";

import { useState, useTransition } from "react";
import { setCustomerType } from "@/server/actions/customerType";
import { CUSTOMER_TYPES } from "@/lib/customerType";
import { ColorSelect } from "@/components/ColorSelect";
import { NAVY } from "@/lib/theme";

// "Customer type" on the customer profile: a colored dropdown, blank by default; it saves as soon as you choose.
export function CustomerTypeSelect({ customerId, value }: { customerId: string; value: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Customer type</span>
      <span style={{ opacity: pending ? 0.6 : 1 }}>
        <ColorSelect
          ariaLabel="Customer type"
          value={value ?? ""}
          options={CUSTOMER_TYPES}
          onChange={(v) => {
            setError(null);
            startTransition(async () => {
              const result = await setCustomerType(customerId, v);
              if (!result.ok) setError(result.error);
            });
          }}
        />
      </span>
      {error && (
        <span role="alert" style={{ color: "#8C1D18", fontSize: 13 }}>
          {error}
        </span>
      )}
    </div>
  );
}
