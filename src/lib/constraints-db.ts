/**
 * Constraints Database Functions
 * 
 * Storage and retrieval for user constraints.
 */

import { getDb } from "@/lib/turso";

export interface Constraint {
  id: string;
  userId: string;
  rule: string;
  triggersJson: string;
  severity: string;
  source: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  
  const client = getDb();
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_constraints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      rule TEXT NOT NULL,
      triggers_json TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      source TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_constraints_user ON user_constraints(user_id)
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_constraints_active ON user_constraints(user_id, active)
  `);
  
  initialized = true;
}

export async function createConstraint(input: {
  userId: string;
  rule: string;
  triggers: string[];
  severity: 'critical' | 'warning';
  source: string;
}): Promise<Constraint> {
  await ensureInitialized();
  const client = getDb();
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  await client.execute({
    sql: `
      INSERT INTO user_constraints (
        id, user_id, rule, triggers_json, severity, source, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `,
    args: [
      id,
      input.userId,
      input.rule,
      JSON.stringify(input.triggers),
      input.severity,
      input.source,
      now,
      now,
    ],
  });
  
  return {
    id,
    userId: input.userId,
    rule: input.rule,
    triggersJson: JSON.stringify(input.triggers),
    severity: input.severity,
    source: input.source,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getActiveConstraints(userId: string): Promise<Constraint[]> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT * FROM user_constraints
      WHERE user_id = ? AND active = 1
      ORDER BY severity DESC, created_at DESC
    `,
    args: [userId],
  });
  
  return result.rows.map(row => ({
    id: row.id as string,
    userId: row.user_id as string,
    rule: row.rule as string,
    triggersJson: row.triggers_json as string,
    severity: row.severity as string,
    source: row.source as string,
    active: Boolean(row.active),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function deactivateConstraint(constraintId: string): Promise<void> {
  await ensureInitialized();
  const client = getDb();
  
  await client.execute({
    sql: `
      UPDATE user_constraints
      SET active = 0, updated_at = ?
      WHERE id = ?
    `,
    args: [new Date().toISOString(), constraintId],
  });
}

export async function checkConstraintExists(userId: string, rule: string): Promise<boolean> {
  await ensureInitialized();
  const client = getDb();
  
  const result = await client.execute({
    sql: `
      SELECT 1 FROM user_constraints
      WHERE user_id = ? AND rule = ? AND active = 1
      LIMIT 1
    `,
    args: [userId, rule],
  });
  
  return result.rows.length > 0;
}
