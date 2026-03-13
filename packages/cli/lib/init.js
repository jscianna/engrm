import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { countTokens } from './tokens.js';
import { extractMemories } from './extract.js';
import { uploadMemories, generateSkill } from './api.js';

export async function init(options) {
  const dir = path.resolve(options.dir);
  const apiKey = options.key || process.env.FATHIPPO_API_KEY;
  
  console.log(chalk.cyan('\n📁 Scanning workspace...\n'));
  
  // Find memory files
  const files = findMemoryFiles(dir);
  
  if (files.length === 0) {
    console.log(chalk.yellow('No memory files found (MEMORY.md, memory/*.md)'));
    console.log(chalk.dim('Run this in a directory with memory files.'));
    return;
  }
  
  // Analyze each file
  let totalTokens = 0;
  const fileStats = [];
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const tokens = countTokens(content);
    totalTokens += tokens;
    fileStats.push({ file: path.relative(dir, file), content, tokens });
    console.log(chalk.dim(`   Found: ${path.relative(dir, file)} (${tokens.toLocaleString()} tokens)`));
  }
  
  console.log(chalk.bold(`\n💡 Total: ${totalTokens.toLocaleString()} tokens loaded every session\n`));
  
  // Extract memories
  const spinner = ora('Extracting memories...').start();
  const memories = [];
  
  for (const { file, content } of fileStats) {
    const extracted = extractMemories(content, file);
    memories.push(...extracted);
  }
  
  spinner.succeed(`Extracted ${memories.length} memories`);
  
  // Calculate savings
  const slimTokens = 600; // Approximate slim MEMORY.md
  const perQueryTokens = 1500; // Average FatHippo query result
  const avgQueriesPerSession = 2;
  const savedPerSession = totalTokens - slimTokens - (perQueryTokens * avgQueriesPerSession);
  
  console.log(chalk.green('\n🚀 Migration plan:\n'));
  console.log(`   → ${memories.length} memories to upload`);
  console.log(`   → Slim MEMORY.md to ~${slimTokens} tokens`);
  console.log(`   → Query relevant context on-demand`);
  
  console.log(chalk.yellow('\n💰 Estimated savings:\n'));
  console.log(`   ${savedPerSession.toLocaleString()} tokens/session`);
  console.log(`   At 20 sessions/day = ${(savedPerSession * 20).toLocaleString()} tokens/day`);
  console.log(`   ≈ $${((savedPerSession * 20 * 30 * 15) / 1000000).toFixed(0)}/month saved (Opus pricing)`);
  
  if (options.dryRun) {
    console.log(chalk.dim('\n--dry-run: No changes made.'));
    console.log(chalk.dim('\nMemories that would be uploaded:'));
    for (const mem of memories.slice(0, 10)) {
      console.log(chalk.dim(`  • ${mem.title}`));
    }
    if (memories.length > 10) {
      console.log(chalk.dim(`  ... and ${memories.length - 10} more`));
    }
    return;
  }
  
  if (!apiKey) {
    console.log(chalk.red('\n❌ No API key provided.'));
    console.log(chalk.dim('Set FATHIPPO_API_KEY or use --key <key>'));
    console.log(chalk.dim('Get your key at https://fathippo.ai/dashboard/settings\n'));
    return;
  }
  
  // Confirm migration
  if (!options.yes) {
    const confirmed = await confirm('\nProceed with migration?');
    if (!confirmed) {
      console.log(chalk.dim('Migration cancelled.'));
      return;
    }
  }
  
  // Upload memories
  const uploadSpinner = ora('Uploading memories...').start();
  
  try {
    const uploaded = await uploadMemories(memories, apiKey);
    uploadSpinner.succeed(`Uploaded ${uploaded} memories to FatHippo`);
  } catch (err) {
    uploadSpinner.fail(`Upload failed: ${err.message}`);
    return;
  }
  
  // Generate skill file
  const skillPath = path.join(dir, 'skills', 'fathippo', 'SKILL.md');
  const skillDir = path.dirname(skillPath);
  
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
  
  fs.writeFileSync(skillPath, generateSkill(apiKey));
  console.log(chalk.green(`\n✅ Created skill file: ${path.relative(dir, skillPath)}`));
  
  // Generate slim MEMORY.md
  const slimMemoryPath = path.join(dir, 'MEMORY.md.slim');
  fs.writeFileSync(slimMemoryPath, generateSlimMemory());
  console.log(chalk.green(`✅ Created slim template: MEMORY.md.slim`));
  console.log(chalk.dim('   Review and replace your MEMORY.md when ready.\n'));
  
  console.log(chalk.cyan('🎉 Migration complete!\n'));
  console.log(chalk.dim('Your agent will now:'));
  console.log(chalk.dim('  1. Load slim MEMORY.md (identity only)'));
  console.log(chalk.dim('  2. Query FatHippo for relevant context'));
  console.log(chalk.dim('  3. Save ~' + savedPerSession.toLocaleString() + ' tokens per session\n'));
}

function findMemoryFiles(dir) {
  const files = [];
  
  // Check MEMORY.md
  const memoryMd = path.join(dir, 'MEMORY.md');
  if (fs.existsSync(memoryMd)) {
    files.push(memoryMd);
  }
  
  // Check memory/*.md
  const memoryDir = path.join(dir, 'memory');
  if (fs.existsSync(memoryDir)) {
    const mdFiles = fs.readdirSync(memoryDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(memoryDir, f));
    files.push(...mdFiles);
  }
  
  return files;
}

function generateSlimMemory() {
  return `# MEMORY.md — Slim Version

## Identity
[Your agent's core identity - who it is, who it serves]

## Preferences  
[Key preferences that apply to every interaction]

## Active Infrastructure
[Trello/Notion IDs, API endpoints - things needed frequently]

## Memory Recall
For project details, past decisions, and context:
→ Query FatHippo using the fathippo skill
→ Don't store everything here - recall what counts

MEMORY.md is identity. FatHippo is recall.
`;
}

async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(chalk.yellow(message + ' (y/n) '), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
