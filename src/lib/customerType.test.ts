import { describe, expect, it } from "vitest";
import { customerTypeChoice, customerTypeFromMonday, isCustomerType } from "./customerType";

describe("customer types", () => {
  it("maps monday.com's labels", () => {
    expect(customerTypeFromMonday("EPC")).toBe("EPC");
    expect(customerTypeFromMonday("Developer")).toBe("DEVELOPER");
    expect(customerTypeFromMonday("Developer/EPC")).toBe("DEVELOPER_EPC");
    expect(customerTypeFromMonday("Investor")).toBe("INVESTOR");
    expect(customerTypeFromMonday("End User / Behind the Meter")).toBe("END_USER");
    expect(customerTypeFromMonday("")).toBeNull();
    expect(customerTypeFromMonday("Something else")).toBeNull();
    expect(customerTypeFromMonday(null)).toBeNull();
  });
  it("knows its own values", () => {
    expect(isCustomerType("DEVELOPER_EPC")).toBe(true);
    expect(isCustomerType("Developer")).toBe(false);
    expect(customerTypeChoice("END_USER")?.label).toBe("End user / behind the meter");
    expect(customerTypeChoice(null)).toBeNull();
  });
});
