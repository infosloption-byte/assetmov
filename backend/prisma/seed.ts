import { prisma } from "../src/lib/prisma.js";

const MiB = 1024n * 1024n;
const GiB = 1024n * MiB;

const defaultPlans = [
  {
    key: "trial",
    name: "Trial",
    description: "Proposed 14-day evaluation plan. Review these defaults before public launch.",
    maxAssets: 100,
    maxActiveUsers: 3,
    storageLimitBytes: 1n * GiB,
    trialDurationDays: 14,
    isActive: true,
  },
  {
    key: "starter",
    name: "Starter",
    description: "Proposed starter plan. Limits are editable by a Platform Super Admin.",
    maxAssets: 500,
    maxActiveUsers: 5,
    storageLimitBytes: 5n * GiB,
    trialDurationDays: 0,
    isActive: true,
  },
  {
    key: "growth",
    name: "Growth",
    description: "Proposed growth plan. Limits are editable by a Platform Super Admin.",
    maxAssets: 2500,
    maxActiveUsers: 25,
    storageLimitBytes: 25n * GiB,
    trialDurationDays: 0,
    isActive: true,
  },
  {
    key: "business",
    name: "Business",
    description: "Proposed business plan. Limits are editable by a Platform Super Admin.",
    maxAssets: 10000,
    maxActiveUsers: 100,
    storageLimitBytes: 100n * GiB,
    trialDurationDays: 0,
    isActive: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    description: "Configure appropriate limits before activation and assignment.",
    maxAssets: null,
    maxActiveUsers: null,
    storageLimitBytes: null,
    trialDurationDays: 14,
    isActive: false,
  },
] as const;

async function main(): Promise<void> {
  for (const plan of defaultPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { key: plan.key },
      create: plan,
      // Seeding must be safe to rerun and must not overwrite admin-edited values.
      update: {},
    });
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write("Plan seeding failed. Check database configuration and migrations.\n");
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
