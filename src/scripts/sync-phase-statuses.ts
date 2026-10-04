// Recomputes every phase's status from its sub-stages (see derivePhaseStatus).
// Use after changing the rule, or to bring older manually-set phase statuses in line.
//   npm run phases:sync -- --dry-run   (show what would change)
//   npm run phases:sync                (apply)

import { prisma } from "@/lib/prisma";
import { derivePhaseStatus } from "@/lib/phaseStatus";

try {
  process.loadEnvFile();
} catch {
  // .env is optional if the variables are already set in the environment.
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const phases = await prisma.phase.findMany({
    include: { project: { select: { name: true } }, subStages: { select: { status: true } } },
    orderBy: [{ project: { name: "asc" } }, { order: "asc" }],
  });

  let changed = 0;
  for (const phase of phases) {
    const derived = derivePhaseStatus(phase.subStages.map((s) => s.status));
    if (!derived || derived === phase.status) continue;

    changed += 1;
    console.log(`${phase.project.name} / ${phase.name}: ${phase.status} -> ${derived}`);
    if (!dryRun) await prisma.phase.update({ where: { id: phase.id }, data: { status: derived } });
  }

  console.log(`\n${dryRun ? "Would change" : "Changed"} ${changed} of ${phases.length} phases.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
