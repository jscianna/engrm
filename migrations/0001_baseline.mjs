import { indexSql, tableSql } from "./schema-definition.mjs";

export const version = "0001";
export const name = "baseline";
export const kind = "sql";
export const baseline = true;
export const sql = `${tableSql}\n${indexSql}`;
