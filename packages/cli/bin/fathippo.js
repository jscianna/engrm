#!/usr/bin/env node

import { Command } from "commander";
import { init } from "../lib/init.js";
import { store } from "../lib/store.js";
import { search } from "../lib/search.js";
import { setup } from "../lib/setup.js";
import { hooks } from "../lib/hooks.js";
import { doctor } from "../lib/doctor.js";
import { uninstall } from "../lib/uninstall.js";

const program = new Command();

program
  .name("fathippo")
  .description("The memory layer for AI agents")
  .version("0.1.0");

program
  .command("init")
  .description("Scan workspace, migrate memories, show token savings")
  .option("-d, --dir <path>", "Directory to scan", ".")
  .option("-k, --key <key>", "FatHippo API key (or set FATHIPPO_API_KEY)")
  .option("--dry-run", "Show what would be migrated without uploading")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(init);

program
  .command("store <text>")
  .description("Store a memory")
  .option("-t, --title <title>", "Memory title")
  .option("-k, --key <key>", "FatHippo API key")
  .action(store);

program
  .command("search <query>")
  .description("Search memories")
  .option("-l, --limit <n>", "Max results", "5")
  .option("-k, --key <key>", "FatHippo API key")
  .action(search);

program
  .command("setup")
  .description("Configure FatHippo MCP for all detected coding platforms")
  .option("-k, --key <key>", "FatHippo API key (or set FATHIPPO_API_KEY)")
  .option("--status", "Show current setup status")
  .option("--remove", "Remove FatHippo from all platform configs")
  .option("--platform <name>", "Only configure a specific platform")
  .action(setup);

program
  .command("hooks <subcommand>")
  .description("Manage git hooks (install | remove)")
  .option("-k, --key <key>", "FatHippo API key")
  .action(hooks);

program
  .command("doctor")
  .description("Run readiness checks for auth, MCP clients, and recall endpoint")
  .option("-k, --key <key>", "FatHippo API key (or set FATHIPPO_API_KEY)")
  .option("--json", "Output machine-readable JSON")
  .action(doctor);

program
  .command("uninstall")
  .description("Safely remove FatHippo integrations from coding platforms")
  .option("--dry-run", "Preview changes without writing files")
  .option("--target <names>", "Comma-separated targets (e.g. claude code,codex,openclaw)")
  .option("--yes", "Skip confirmation prompt")
  .option("--list", "List detected/configured uninstall targets")
  .option("--restore <backupId>", "Restore configs from a previous uninstall backup")
  .action(uninstall);

program.parse();
