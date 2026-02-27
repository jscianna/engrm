import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  // Get count before
  const before = await db.execute("SELECT COUNT(*) as count FROM memories");
  console.log("Memories before:", before.rows[0].count);

  // Delete all memories
  await db.execute("DELETE FROM memories");
  
  // Delete all memory edges
  await db.execute("DELETE FROM memory_edges");
  
  // Delete all vectors
  await db.execute("DELETE FROM memory_vectors");

  console.log("All memories deleted. Clean slate!");
}

main().catch(console.error);
