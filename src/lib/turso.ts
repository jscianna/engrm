/**
 * Shared Turso database client
 * Single instance used across all modules
 */

import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

export function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error("TURSO_DATABASE_URL is required");
    }

    client = createClient({ url, authToken });
  }
  return client;
}

/**
 * Close the database connection (for cleanup/testing)
 */
export function closeDb(): void {
  if (client) {
    client.close();
    client = null;
  }
}
