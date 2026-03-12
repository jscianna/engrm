/**
 * Constraints Database Functions
 * 
 * Storage and retrieval for user constraints.
 */

import { ensureDatabaseMigrations } from "@/lib/db-migrations";
import { getDb } from "@/lib/turso";

export type ConstraintScope = 'global' | 'template' | 'user' | 'session';

export interface Constraint {
  id: string;
  userId: string;
  rule: string;
  triggersJson: string;
  severity: string;
  scope: ConstraintScope;
  templateId: string | null;  // For template-based constraints
  source: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  
  await ensureDatabaseMigrations();
  const client = getDb();
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_constraints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      rule TEXT NOT NULL,
      triggers_json TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      scope TEXT NOT NULL DEFAULT 'user',
      template_id TEXT,
      source TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  // Add scope column if it doesn't exist (migration)
  await client.execute(`
    ALTER TABLE user_constraints ADD COLUMN scope TEXT DEFAULT 'user'
  `).catch(() => {});
  
  await client.execute(`
    ALTER TABLE user_constraints ADD COLUMN template_id TEXT
  `).catch(() => {});
  
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
  scope?: ConstraintScope;
  templateId?: string;
  source: string;
}): Promise<Constraint> {
  await ensureInitialized();
  const client = getDb();
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const scope = input.scope || 'user';
  
  await client.execute({
    sql: `
      INSERT INTO user_constraints (
        id, user_id, rule, triggers_json, severity, scope, template_id, source, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `,
    args: [
      id,
      input.userId,
      input.rule,
      JSON.stringify(input.triggers),
      input.severity,
      scope,
      input.templateId || null,
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
    scope,
    templateId: input.templateId || null,
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
    scope: (row.scope as ConstraintScope) || 'user',
    templateId: row.template_id as string | null,
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

// ============================================================================
// GLOBAL DEFAULTS - Applied to all users automatically
// ============================================================================

export const GLOBAL_CONSTRAINTS: Array<{
  rule: string;
  triggers: string[];
  severity: 'critical' | 'warning';
}> = [
  {
    rule: "Never expose API keys, tokens, or secrets in outputs",
    triggers: ["api", "key", "token", "secret", "credential", "password"],
    severity: "critical",
  },
  {
    rule: "Sanitize PII before storing in traces or memories",
    triggers: ["pii", "personal", "data", "email", "phone", "address"],
    severity: "critical",
  },
];

// ============================================================================
// CONSTRAINT TEMPLATES - Users can opt-in
// ============================================================================

export interface ConstraintTemplate {
  id: string;
  name: string;
  description: string;
  constraints: Array<{
    rule: string;
    triggers: string[];
    severity: 'critical' | 'warning';
  }>;
}

export const CONSTRAINT_TEMPLATES: ConstraintTemplate[] = [
  {
    id: "startup-stealth",
    name: "Startup Stealth Mode",
    description: "For pre-launch startups keeping things confidential",
    constraints: [
      { rule: "Keep all project details confidential until launch", triggers: ["share", "public", "post", "publish"], severity: "critical" },
      { rule: "Don't mention company name publicly", triggers: ["tweet", "post", "share", "public"], severity: "warning" },
      { rule: "Ask before any external communication", triggers: ["email", "send", "contact", "outreach"], severity: "warning" },
    ],
  },
  {
    id: "enterprise-compliance", 
    name: "Enterprise Compliance",
    description: "For regulated industries and enterprise security",
    constraints: [
      { rule: "No customer data in logs or traces", triggers: ["log", "trace", "debug", "customer", "client"], severity: "critical" },
      { rule: "Require approval for production deployments", triggers: ["deploy", "production", "prod", "release"], severity: "critical" },
      { rule: "Follow change management process", triggers: ["change", "modify", "update", "patch"], severity: "warning" },
    ],
  },
  {
    id: "open-source",
    name: "Open Source Contributor",
    description: "For maintaining public open source projects",
    constraints: [
      { rule: "No proprietary code in public commits", triggers: ["push", "commit", "pr", "public"], severity: "critical" },
      { rule: "Check license compatibility before adding dependencies", triggers: ["install", "add", "dependency", "package"], severity: "warning" },
    ],
  },
];

export function getTemplate(templateId: string): ConstraintTemplate | undefined {
  return CONSTRAINT_TEMPLATES.find(t => t.id === templateId);
}

export async function applyTemplate(userId: string, templateId: string): Promise<Constraint[]> {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  
  const created: Constraint[] = [];
  for (const c of template.constraints) {
    const exists = await checkConstraintExists(userId, c.rule);
    if (!exists) {
      const constraint = await createConstraint({
        userId,
        rule: c.rule,
        triggers: c.triggers,
        severity: c.severity,
        scope: 'template',
        templateId,
        source: `template:${templateId}`,
      });
      created.push(constraint);
    }
  }
  
  return created;
}
