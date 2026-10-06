import { describe, expect, it } from "vitest";
import { capacityKwp, formatKwp } from "./capacity";

describe("capacityKwp", () => {
  it("prefers the exact contract figure", () => {
    expect(capacityKwp({ capacityKwp: "996.84", capacityMw: "0.997" })).toBe(996.84);
    expect(capacityKwp({ capacityKwp: 6899.2, capacityMw: 6.899 })).toBe(6899.2);
  });
  it("falls back to the imported megawatts times 1000", () => {
    expect(capacityKwp({ capacityKwp: null, capacityMw: "9.408" })).toBe(9408);
    expect(capacityKwp({ capacityMw: 4.4698 })).toBe(4469.8);
  });
  it("is null when nothing is known", () => {
    expect(capacityKwp({ capacityKwp: null, capacityMw: null })).toBeNull();
    expect(capacityKwp({})).toBeNull();
    expect(capacityKwp({ capacityKwp: 0, capacityMw: 0 })).toBeNull();
  });
});

describe("formatKwp", () => {
  it("shows up to two decimals with thousands separators", () => {
    expect(formatKwp(9408)).toBe("9,408");
    expect(formatKwp(6899.2)).toBe("6,899.2");
    expect(formatKwp(996.84)).toBe("996.84");
    expect(formatKwp(null)).toBe("—");
  });
});
