import type { PrismaClient, Department, PhaseName } from "@prisma/client";

export type TemplateSeed = {
  phase: PhaseName;
  department: Department;
  name: string;
  order: number;
};

// Order is the global display order across all phases, in the sequence
// given in the source list, so sub-stages sort correctly within a phase
// and phases sort correctly relative to each other.
export const SUB_STAGE_TEMPLATES: TemplateSeed[] = [
  // 00 Initiation
  { phase: "INITIATION", department: "FINANCE", name: "Contract Signing & Project Opening", order: 1 },
  { phase: "INITIATION", department: "DESIGN", name: "Internal Kickoff", order: 2 },
  { phase: "INITIATION", department: "DESIGN", name: "Customer Kickoff", order: 3 },

  // 01 Design
  { phase: "DESIGN", department: "FINANCE", name: "Advance Payment", order: 4 },
  { phase: "DESIGN", department: "DESIGN", name: "Design Questionnaire", order: 5 },
  { phase: "DESIGN", department: "DESIGN", name: "Initial Layout Approval", order: 6 },
  { phase: "DESIGN", department: "DESIGN", name: "Mechanical BOM Release", order: 7 },
  { phase: "DESIGN", department: "DESIGN", name: "Full Design Package Review", order: 8 },
  { phase: "DESIGN", department: "DESIGN", name: "Design Package Release to Customer", order: 9 },

  // 02 Supply
  { phase: "SUPPLY", department: "SUPPLY", name: "Manufacturing Start", order: 10 },
  { phase: "SUPPLY", department: "LOGISTICS", name: "Logistics Meeting", order: 11 },
  { phase: "SUPPLY", department: "SUPPLY", name: "Manufacturing Completion", order: 12 },
  { phase: "SUPPLY", department: "LOGISTICS", name: "Delivery – Piles", order: 13 },
  { phase: "SUPPLY", department: "LOGISTICS", name: "Delivery – Tracker Structure", order: 14 },
  { phase: "SUPPLY", department: "LOGISTICS", name: "Delivery – Drive Units & I&C", order: 15 },
  { phase: "SUPPLY", department: "SUPPLY", name: "Supply Completion", order: 16 },

  // 03 Construction
  { phase: "CONSTRUCTION", department: "CONSTRUCTION", name: "Pre-Construction Meeting", order: 17 },
  { phase: "CONSTRUCTION", department: "CONSTRUCTION", name: "Pile Installation", order: 18 },
  { phase: "CONSTRUCTION", department: "CONSTRUCTION", name: "Tracker Structure & Drive Units", order: 19 },
  { phase: "CONSTRUCTION", department: "CONSTRUCTION", name: "Electrical Cabling & PV Modules", order: 20 },
  { phase: "CONSTRUCTION", department: "CONSTRUCTION", name: "I&C & Communication", order: 21 },

  // 04 Commissioning
  { phase: "COMMISSIONING", department: "COMMISSIONING", name: "Pre-Commissioning Meeting", order: 22 },
  { phase: "COMMISSIONING", department: "COMMISSIONING", name: "Commissioning Information Received", order: 23 },
  { phase: "COMMISSIONING", department: "COMMISSIONING", name: "Solargik Commissioning", order: 24 },
  { phase: "COMMISSIONING", department: "COMMISSIONING", name: "Movement Tests – Customer", order: 25 },
  { phase: "COMMISSIONING", department: "COMMISSIONING", name: "Commissioning Certificate", order: 26 },

  // 05 O&M
  { phase: "OM", department: "COMMISSIONING", name: "O&M Handover", order: 27 },
];

export async function seedSubStageTemplates(prisma: PrismaClient) {
  for (const template of SUB_STAGE_TEMPLATES) {
    await prisma.subStageTemplate.upsert({
      where: { phase_name: { phase: template.phase, name: template.name } },
      update: { department: template.department, order: template.order, active: true },
      create: template,
    });
  }
  return SUB_STAGE_TEMPLATES.length;
}
