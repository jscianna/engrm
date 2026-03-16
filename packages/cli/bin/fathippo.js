#!/usr/bin/env node

import { Command } from "commander";
import { init } from "../lib/init.js";
import { store } from "../lib/store.js";
import { search } from "../lib/search.js";
import { setup } from "../lib/setup.js";

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

program.parse();
