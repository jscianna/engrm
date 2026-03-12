import * as baseline from "./0001_baseline.mjs";
import * as schemaRepair from "./0002_schema_repair.mjs";

export const migrations = [baseline, schemaRepair];
