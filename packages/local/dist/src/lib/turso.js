"use strict";
/**
 * Shared Turso database client
 * Single instance used across all modules
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.closeDb = closeDb;
const client_1 = require("@libsql/client");
let client = null;
function getDb() {
    if (!client) {
        const url = process.env.TURSO_DATABASE_URL;
        const authToken = process.env.TURSO_AUTH_TOKEN;
        if (!url) {
            throw new Error("TURSO_DATABASE_URL is required");
        }
        client = (0, client_1.createClient)({ url, authToken });
    }
    return client;
}
/**
 * Close the database connection (for cleanup/testing)
 */
function closeDb() {
    if (client) {
        client.close();
        client = null;
    }
}
//# sourceMappingURL=turso.js.map