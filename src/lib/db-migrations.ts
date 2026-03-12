import { getDb } from "@/lib/turso";
import { migrateDatabase } from "@/lib/db-migrations-core.mjs";

let initialized = false;
let initializingPromise: Promise<void> | null = null;

export async function ensureDatabaseMigrations(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initializingPromise) {
    await initializingPromise;
    return;
  }

  initializingPromise = (async () => {
    await migrateDatabase({
      client: getDb(),
      logger: console,
    });
    initialized = true;
  })().catch((error) => {
    initializingPromise = null;
    throw error;
  });

  await initializingPromise;
}
