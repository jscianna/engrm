#!/usr/bin/env node

import { createClient } from "@libsql/client";
import { getMigrationStatus, migrateDatabase } from "../src/lib/db-migrations-core.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function printStatus(status) {
  for (const migration of status) {
    const marker = migration.applied ? "x" : " ";
    const suffix = migration.appliedAt ? ` applied ${migration.appliedAt}` : " pending";
    console.log(`[${marker}] ${migration.version}_${migration.name} (${migration.kind})${suffix}`);
  }
}

async function main() {
  const statusOnly = process.argv.includes("--status");
  const client = createClient({
    url: requireEnv("TURSO_DATABASE_URL"),
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    if (statusOnly) {
      const status = await getMigrationStatus({ client });
      printStatus(status);
      return;
    }

    const result = await migrateDatabase({ client, logger: console });
    console.log(
      `[db:migrate] complete: ${result.executed.length} applied, ${result.baselined.length} baseline-marked, ${result.applied}/${result.total} total.`,
    );
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error("[db:migrate] failed:", error);
  process.exitCode = 1;
});
