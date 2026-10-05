import { describe, expect, it } from "vitest";
import { cleanDepartments, departmentsParam, parseDepartments, toggleDepartment } from "./departmentFilter";

describe("department filter", () => {
  it("reads a comma list from the URL, ignoring junk, in a fixed order", () => {
    expect(parseDepartments({ dept: "design,FINANCE,nonsense" })).toEqual(["FINANCE", "DESIGN"]);
    expect(parseDepartments({})).toEqual([]);
    expect(parseDepartments({ dept: ["LOGISTICS", "SUPPLY"] })).toEqual(["LOGISTICS"]);
  });

  it("writes nothing back when no department, or every department, is chosen", () => {
    expect(departmentsParam([])).toBeUndefined();
    expect(departmentsParam(["FINANCE", "DESIGN", "SUPPLY", "LOGISTICS", "CONSTRUCTION", "COMMISSIONING"])).toBeUndefined();
    expect(departmentsParam(["DESIGN", "FINANCE"])).toBe("FINANCE,DESIGN");
  });

  it("toggles a department on and off", () => {
    expect(toggleDepartment([], "FINANCE")).toEqual(["FINANCE"]);
    expect(toggleDepartment(["FINANCE", "DESIGN"], "FINANCE")).toEqual(["DESIGN"]);
  });

  it("cleans untrusted input", () => {
    expect(cleanDepartments(["FINANCE", "DROP TABLE", 5])).toEqual(["FINANCE"]);
    expect(cleanDepartments("FINANCE")).toEqual([]);
  });
});
