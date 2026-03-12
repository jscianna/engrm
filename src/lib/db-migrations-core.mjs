import crypto from "node:crypto";
import { migrations } from "../../migrations/manifest.mjs";

const MIGRATION_TABLE = "_schema_migrations";

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll(`"`, `""`)}"`;
}

function migrationChecksum(migration) {
  if (migration.kind === "sql") {
    return sha256(migration.sql);
  }
  return sha256(migration.signature ?? String(migration.up));
}

async function ensureMigrationTable(client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      execution_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.execute(`
    SELECT version, name, kind, checksum, applied_at, execution_ms
    FROM ${MIGRATION_TABLE}
    ORDER BY version ASC
  `);

  return new Map(
    result.rows.map((row) => [
      String(row.version),
      {
        version: String(row.version),
        name: String(row.name),
        kind: String(row.kind),
        checksum: String(row.checksum),
        appliedAt: String(row.applied_at),
        executionMs: Number(row.execution_ms ?? 0),
      },
    ]),
  );
}

async function insertMigrationRecord(client, migration, appliedAt, executionMs) {
  try {
    await client.execute({
      sql: `
        INSERT INTO ${MIGRATION_TABLE} (version, name, kind, checksum, applied_at, execution_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        migration.version,
        migration.name,
        migration.kind,
        migration.checksum,
        appliedAt,
        executionMs,
      ],
    });
  } catch (error) {
    const applied = await getAppliedMigrations(client);
    const existing = applied.get(migration.version) ?? null;
    if (existing && existing.checksum === migration.checksum) {
      return existing;
    }
    throw error;
  }

  return {
    version: migration.version,
    name: migration.name,
    kind: migration.kind,
    checksum: migration.checksum,
    appliedAt,
    executionMs,
  };
}

async function listUserTables(client) {
  const result = await client.execute({
    sql: `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name != ?
      ORDER BY name ASC
    `,
    args: [MIGRATION_TABLE],
  });

  return result.rows
    .map((row) => String(row.name ?? ""))
    .filter(Boolean);
}

export function createMigrationHelpers(client) {
  return {
    quoteIdentifier,
    async tableExists(tableName) {
      const result = await client.execute({
        sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
        args: [tableName],
      });
      return result.rows.length > 0;
    },
    async getTableColumns(tableName) {
      const result = await client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
      return new Set(
        result.rows
          .map((row) => {
            const record = row ?? {};
            return typeof record.name === "string" ? record.name : null;
          })
          .filter(Boolean),
      );
    },
    async ensureColumns(tableName, columns) {
      let existing = await this.getTableColumns(tableName);
      for (const column of columns) {
        if (existing.has(column.name)) {
          continue;
        }
        try {
          await client.execute(
            `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(column.name)} ${column.ddl}`,
          );
          existing.add(column.name);
        } catch (error) {
          existing = await this.getTableColumns(tableName);
          if (!existing.has(column.name)) {
            throw error;
          }
        }
      }
    },
  };
}

function normalizeMigration(migration) {
  return {
    version: migration.version,
    name: migration.name,
    kind: migration.kind,
    baseline: migration.baseline === true,
    checksum: migrationChecksum(migration),
    sql: migration.sql,
    up: migration.up,
  };
}

export async function getMigrationStatus({ client }) {
  await ensureMigrationTable(client);
  const applied = await getAppliedMigrations(client);

  return migrations.map((entry) => {
    const migration = normalizeMigration(entry);
    const appliedRecord = applied.get(migration.version) ?? null;

    if (appliedRecord && appliedRecord.checksum !== migration.checksum) {
      throw new Error(
        `Migration checksum mismatch for ${migration.version}_${migration.name}. Expected ${appliedRecord.checksum}, got ${migration.checksum}.`,
      );
    }

    return {
      version: migration.version,
      name: migration.name,
      kind: migration.kind,
      baseline: migration.baseline,
      checksum: migration.checksum,
      applied: Boolean(appliedRecord),
      appliedAt: appliedRecord?.appliedAt ?? null,
      executionMs: appliedRecord?.executionMs ?? null,
    };
  });
}

export async function migrateDatabase({ client, logger = console }) {
  await ensureMigrationTable(client);
  const applied = await getAppliedMigrations(client);
  const existingTables = applied.size === 0 ? await listUserTables(client) : [];
  const hasExistingSchema = existingTables.length > 0;
  const executed = [];
  const baselined = [];

  for (const entry of migrations) {
    const migration = normalizeMigration(entry);
    const existingRecord = applied.get(migration.version) ?? null;

    if (existingRecord) {
      if (existingRecord.checksum !== migration.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.version}_${migration.name}. Expected ${existingRecord.checksum}, got ${migration.checksum}.`,
        );
      }
      continue;
    }

    if (migration.baseline && applied.size === 0 && hasExistingSchema) {
      const appliedRecord = await insertMigrationRecord(
        client,
        migration,
        new Date().toISOString(),
        0,
      );
      baselined.push(migration.version);
      applied.set(migration.version, appliedRecord);
      logger.info?.(
        `[db:migrate] Baseline-marked ${migration.version}_${migration.name} for existing schema (${existingTables.length} tables found).`,
      );
      continue;
    }

    const startedAt = Date.now();
    if (migration.kind === "sql") {
      await client.executeMultiple(migration.sql);
    } else {
      if (typeof migration.up !== "function") {
        throw new Error(`Migration ${migration.version}_${migration.name} is missing an up() function.`);
      }
      await migration.up({ client, helpers: createMigrationHelpers(client), logger });
    }
    const executionMs = Date.now() - startedAt;
    const appliedAt = new Date().toISOString();
    const appliedRecord = await insertMigrationRecord(client, migration, appliedAt, executionMs);

    applied.set(migration.version, appliedRecord);
    executed.push({
      version: migration.version,
      name: migration.name,
      kind: migration.kind,
      executionMs,
    });
    logger.info?.(`[db:migrate] Applied ${migration.version}_${migration.name} (${executionMs}ms).`);
  }

  return {
    executed,
    baselined,
    total: migrations.length,
    applied: applied.size,
  };
}
