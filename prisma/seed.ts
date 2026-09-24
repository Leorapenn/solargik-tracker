import { PrismaClient } from "@prisma/client";
import { seedSubStageTemplates } from "./seedData";

const prisma = new PrismaClient();

async function main() {
  const count = await seedSubStageTemplates(prisma);
  console.log(`Seeded ${count} sub-stage templates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
