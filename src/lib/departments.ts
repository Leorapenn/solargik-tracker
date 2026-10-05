import type { Department } from "@prisma/client";

export const DEPARTMENTS: Department[] = ["FINANCE", "DESIGN", "SUPPLY", "LOGISTICS", "CONSTRUCTION", "COMMISSIONING"];

const LABELS: Record<Department, string> = {
  FINANCE: "Finance",
  DESIGN: "Design",
  SUPPLY: "Supply",
  LOGISTICS: "Logistics",
  CONSTRUCTION: "Construction",
  COMMISSIONING: "Commissioning",
};

export const departmentLabel = (department: Department) => LABELS[department];
