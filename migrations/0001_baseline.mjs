import { indexSql, tableSql } from "./schema-definition.mjs";

export const version = "0001";
export const name = "baseline";
export const kind = "sql";
export const baseline = true;

// Immutable checksum expected in production _schema_migrations.
// Do not change after rollout; add new migrations instead.
export const lockedChecksum = "f59e9dedf18d4a4dd8bbeb30ef5d13163a21c2ecc7d8747e7952d851a9ae23bc";

export const sql = `${tableSql}\n${indexSql}`;
