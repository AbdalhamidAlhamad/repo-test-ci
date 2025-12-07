import { print, system } from "gluegun";

export async function setupPrisma() {
  const prismaSpinner = print.spin("Setting up prisma...\n");
  try {
    await system.run("npm run db:generate");
    prismaSpinner.succeed("Prisma setup done");
  } catch (error) {
    prismaSpinner.fail("Prisma setup failed!\n");
    process.exit(0);
  }
  prismaSpinner.stop();
}
