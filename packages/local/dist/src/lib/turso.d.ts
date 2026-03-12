/**
 * Shared Turso database client
 * Single instance used across all modules
 */
import { type Client } from "@libsql/client";
export declare function getDb(): Client;
/**
 * Close the database connection (for cleanup/testing)
 */
export declare function closeDb(): void;
//# sourceMappingURL=turso.d.ts.map