import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';

const homedir = os.homedir();

// ─── Platform detection helpers ──────────────────────────────────────────────

function commandExists(cmd) {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${which} ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function existsSync(p) {
  return fs.existsSync(p);
}

const PLATFORMS = [
  {
    name: 'Claude Code',
    detect: () =>
      existsSync(path.join(homedir, '.claude.json')) || commandExists('claude'),
    configPath: path.join(homedir, '.claude.json'),
    format: 'claude',
  },
  {
    name: 'Cursor',
    detect: () => existsSync(path.join(homedir, '.cursor')),
    configPath: path.join(homedir, '.cursor', 'mcp.json'),
    format: 'mcp-json',
  },
  {
    name: 'Codex',
    detect: () =>
      existsSync(path.join(homedir, '.codex')) || commandExists('codex'),
    configPath: path.join(homedir, '.codex', 'config.toml'),
    format: 'toml',
  },
  {
    name: 'Windsurf',
    detect: () => existsSync(path.join(homedir, '.codeium')),
    configPath: path.join(homedir, '.codeium', 'windsurf', 'mcp_config.json'),
    format: 'mcp-json',
  },
  {
    name: 'Zed',
    detect: () => existsSync(path.join(homedir, '.config', 'zed')),
    configPath: path.join(homedir, '.config', 'zed', 'settings.json'),
    format: 'zed',
  },
  {
    name: 'VS Code',
    detect: () =>
      existsSync(path.join(homedir, '.vscode')) || commandExists('code'),
    configPath: path.join(homedir, '.vscode', 'mcp.json'),
    format: 'vscode',
  },
  {
    name: 'OpenCode',
    detect: () =>
      existsSync(path.join(homedir, '.config', 'opencode')) ||
      commandExists('opencode'),
    configPath: path.join(homedir, '.config', 'opencode', 'config.json'),
    format: 'mcp-json',
  },
];

// ─── MCP server entry for each format ────────────────────────────────────────

function makeMcpEntry(apiKey) {
  return {
    command: 'npx',
    args: ['-y', '@fathippo/mcp-server'],
    env: { FATHIPPO_API_KEY: apiKey },
  };
}

// ─── JSON config writers ──────────────────────────────────────────────────────

/**
 * Read a JSON file, returning {} on missing/malformed.
 */
function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null; // signals parse error
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Merge fathippo into a `mcpServers` key (Claude Code / Cursor / Windsurf / OpenCode).
 */
function writeMcpJson(configPath, apiKey) {
  const existing = readJson(configPath);
  if (existing === null) throw new Error(`Malformed JSON in ${configPath}`);
  const updated = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      fathippo: makeMcpEntry(apiKey),
    },
  };
  writeJson(configPath, updated);
}

/**
 * VS Code uses `servers` key instead of `mcpServers`.
 */
function writeVsCodeJson(configPath, apiKey) {
  const existing = readJson(configPath);
  if (existing === null) throw new Error(`Malformed JSON in ${configPath}`);
  const updated = {
    ...existing,
    servers: {
      ...(existing.servers || {}),
      fathippo: makeMcpEntry(apiKey),
    },
  };
  writeJson(configPath, updated);
}

/**
 * Zed uses `context_servers` key with a different shape.
 */
function writeZedJson(configPath, apiKey) {
  const existing = readJson(configPath);
  if (existing === null) throw new Error(`Malformed JSON in ${configPath}`);
  const updated = {
    ...existing,
    context_servers: {
      ...(existing.context_servers || {}),
      fathippo: {
        settings: {},
        command: {
          path: 'npx',
          args: ['-y', '@fathippo/mcp-server'],
          env: { FATHIPPO_API_KEY: apiKey },
        },
      },
    },
  };
  writeJson(configPath, updated);
}

// ─── TOML writer (Codex) ──────────────────────────────────────────────────────

function buildTomlSection(apiKey) {
  return `\n[mcp.fathippo]\ncommand = "npx"\nargs = ["-y", "@fathippo/mcp-server"]\n\n[mcp.fathippo.env]\nFATHIPPO_API_KEY = "${apiKey}"\n`;
}

/**
 * Merge fathippo TOML section — replace if exists, append if not.
 * Only touches the [mcp.fathippo] and [mcp.fathippo.env] sections.
 */
function writeToml(configPath, apiKey) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let existing = '';
  if (fs.existsSync(configPath)) {
    existing = fs.readFileSync(configPath, 'utf-8');
  }

  const section = buildTomlSection(apiKey);

  // Match [mcp.fathippo] section: from that header up to (but not including)
  // the next top-level or dotted section header, or end of file.
  // We need to handle both [mcp.fathippo] and [mcp.fathippo.env] together.
  const sectionStart = /\[mcp\.fathippo\]/;
  if (sectionStart.test(existing)) {
    // Find the start of [mcp.fathippo]
    const startIdx = existing.search(sectionStart);
    // Find the next section header AFTER [mcp.fathippo.env] (or after [mcp.fathippo] if no .env)
    // We look for any [...] header that isn't [mcp.fathippo...] after startIdx
    const afterStart = existing.slice(startIdx);
    // Find where the fathippo block ends: next [ that isn't part of mcp.fathippo
    const endMatch = afterStart.match(/\n\[(?!mcp\.fathippo)/);
    if (endMatch && endMatch.index !== undefined) {
      const endIdx = startIdx + endMatch.index;
      const updated = existing.slice(0, startIdx) + section.trimStart() + '\n' + existing.slice(endIdx + 1);
      fs.writeFileSync(configPath, updated, 'utf-8');
    } else {
      // fathippo section runs to end of file — replace everything from startIdx
      const updated = existing.slice(0, startIdx) + section.trimStart();
      fs.writeFileSync(configPath, updated, 'utf-8');
    }
  } else {
    // Append
    const separator = existing.endsWith('\n') || existing === '' ? '' : '\n';
    fs.writeFileSync(configPath, existing + separator + section, 'utf-8');
  }
}

// ─── Remove helpers ───────────────────────────────────────────────────────────

function removeMcpJson(configPath) {
  if (!fs.existsSync(configPath)) return false;
  const existing = readJson(configPath);
  if (!existing || !existing.mcpServers?.fathippo) return false;
  delete existing.mcpServers.fathippo;
  writeJson(configPath, existing);
  return true;
}

function removeVsCodeJson(configPath) {
  if (!fs.existsSync(configPath)) return false;
  const existing = readJson(configPath);
  if (!existing || !existing.servers?.fathippo) return false;
  delete existing.servers.fathippo;
  writeJson(configPath, existing);
  return true;
}

function removeZedJson(configPath) {
  if (!fs.existsSync(configPath)) return false;
  const existing = readJson(configPath);
  if (!existing || !existing.context_servers?.fathippo) return false;
  delete existing.context_servers.fathippo;
  writeJson(configPath, existing);
  return true;
}

function removeToml(configPath) {
  if (!fs.existsSync(configPath)) return false;
  let content = fs.readFileSync(configPath, 'utf-8');
  const sectionStart = /\[mcp\.fathippo\]/;
  if (!sectionStart.test(content)) return false;
  const startIdx = content.search(sectionStart);
  const afterStart = content.slice(startIdx);
  const endMatch = afterStart.match(/\n\[(?!mcp\.fathippo)/);
  if (endMatch && endMatch.index !== undefined) {
    content = content.slice(0, startIdx) + content.slice(startIdx + endMatch.index + 1);
  } else {
    content = content.slice(0, startIdx);
  }
  fs.writeFileSync(configPath, content, 'utf-8');
  return true;
}

// ─── Check if a platform is already configured ───────────────────────────────

function isPlatformConfigured(platform) {
  if (!fs.existsSync(platform.configPath)) return false;
  try {
    switch (platform.format) {
      case 'claude':
      case 'mcp-json': {
        const data = readJson(platform.configPath);
        return !!(data?.mcpServers?.fathippo);
      }
      case 'vscode': {
        const data = readJson(platform.configPath);
        return !!(data?.servers?.fathippo);
      }
      case 'zed': {
        const data = readJson(platform.configPath);
        return !!(data?.context_servers?.fathippo);
      }
      case 'toml': {
        const content = fs.readFileSync(platform.configPath, 'utf-8');
        return /\[mcp\.fathippo\]/.test(content);
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ─── Config storage ───────────────────────────────────────────────────────────

const FATHIPPO_CONFIG_DIR = path.join(homedir, '.fathippo');
const FATHIPPO_CONFIG_PATH = path.join(FATHIPPO_CONFIG_DIR, 'config.json');

function readFathippoConfig() {
  try {
    return JSON.parse(fs.readFileSync(FATHIPPO_CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveFathippoConfig(apiKey, configuredPlatforms) {
  fs.mkdirSync(FATHIPPO_CONFIG_DIR, { recursive: true });
  const existing = readFathippoConfig();
  const config = {
    apiKey,
    baseUrl: 'https://fathippo.ai/api',
    setupAt: new Date().toISOString(),
    platforms: configuredPlatforms,
    ...existing,
    // overwrite key fields
    apiKey,
    platforms: configuredPlatforms,
    setupAt: new Date().toISOString(),
  };
  fs.writeFileSync(FATHIPPO_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ─── Prompt helper ────────────────────────────────────────────────────────────

async function promptApiKey() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(chalk.yellow('Enter your FatHippo API key: '), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Status command ───────────────────────────────────────────────────────────

function showStatus() {
  console.log(chalk.cyan('\n🦛 FatHippo Setup Status\n'));

  const config = readFathippoConfig();
  if (config.apiKey) {
    const masked =
      config.apiKey.length > 8
        ? config.apiKey.slice(0, 6) + '...' + config.apiKey.slice(-3)
        : config.apiKey;
    console.log(chalk.green(`API Key: ✔ Configured (${masked})`));
  } else {
    console.log(chalk.red('API Key: ✗ Not configured'));
  }

  console.log('\nPlatforms:');
  for (const platform of PLATFORMS) {
    const detected = platform.detect();
    if (!detected) {
      console.log(chalk.dim(`  ✗ ${platform.name} — not detected`));
      continue;
    }
    const configured = isPlatformConfigured(platform);
    if (configured) {
      console.log(chalk.green(`  ✔ ${platform.name} — configured`));
    } else {
      console.log(chalk.yellow(`  ○ ${platform.name} — detected, not configured`));
    }
  }
  console.log();
}

// ─── Remove command ───────────────────────────────────────────────────────────

function removeFromAll(platformFilter) {
  console.log(chalk.cyan('\n🦛 Removing FatHippo from platform configs...\n'));

  const targets = platformFilter
    ? PLATFORMS.filter((p) => p.name.toLowerCase() === platformFilter.toLowerCase())
    : PLATFORMS;

  let removed = 0;
  for (const platform of targets) {
    try {
      let ok = false;
      switch (platform.format) {
        case 'claude':
        case 'mcp-json':
          ok = removeMcpJson(platform.configPath);
          break;
        case 'vscode':
          ok = removeVsCodeJson(platform.configPath);
          break;
        case 'zed':
          ok = removeZedJson(platform.configPath);
          break;
        case 'toml':
          ok = removeToml(platform.configPath);
          break;
      }
      if (ok) {
        console.log(chalk.green(`  ✔ ${platform.name} — removed`));
        removed++;
      } else {
        console.log(chalk.dim(`  ✗ ${platform.name} — not configured, skipped`));
      }
    } catch (err) {
      console.log(chalk.red(`  ✗ ${platform.name} — error: ${err.message}`));
    }
  }

  console.log(`\nRemoved FatHippo from ${removed} platform(s).\n`);
}

// ─── Main setup command ───────────────────────────────────────────────────────

export async function setup(options) {
  // --status
  if (options.status) {
    showStatus();
    return;
  }

  // --remove
  if (options.remove) {
    removeFromAll(options.platform || null);
    return;
  }

  console.log(chalk.cyan('\n🦛 FatHippo Setup\n'));

  // Resolve API key
  let apiKey = options.key || process.env.FATHIPPO_API_KEY;

  if (!apiKey) {
    // Try loading from existing config
    const existingConfig = readFathippoConfig();
    if (existingConfig.apiKey) {
      apiKey = existingConfig.apiKey;
      console.log(chalk.dim('Using API key from ~/.fathippo/config.json'));
    }
  }

  if (!apiKey) {
    console.log(chalk.dim('Get your API key at https://fathippo.ai/dashboard/settings\n'));
    apiKey = await promptApiKey();
  }

  if (!apiKey) {
    console.log(chalk.red('❌ No API key provided. Aborting.'));
    process.exit(1);
  }

  // Store API key
  const keySpinner = ora('Storing API key...').start();
  try {
    // We'll save config at the end with platform list, just create dir now
    fs.mkdirSync(FATHIPPO_CONFIG_DIR, { recursive: true });
    keySpinner.succeed(`API key stored in ~/.fathippo/config.json`);
  } catch (err) {
    keySpinner.fail(`Failed to create ~/.fathippo/: ${err.message}`);
    process.exit(1);
  }

  // Detect platforms
  const targets = options.platform
    ? PLATFORMS.filter((p) => p.name.toLowerCase() === options.platform.toLowerCase())
    : PLATFORMS;

  console.log('\nDetected coding platforms:');

  const configured = [];
  const results = [];

  for (const platform of PLATFORMS) {
    // If we're filtering, only configure matched platform
    const shouldConfigure = !options.platform || targets.includes(platform);
    const detected = platform.detect();

    if (!detected) {
      console.log(chalk.dim(`  ✗ ${platform.name} (not detected)`));
      results.push({ platform, detected: false, configured: false });
      continue;
    }

    if (!shouldConfigure) {
      console.log(chalk.dim(`  ○ ${platform.name} (skipped — use --platform to include)`));
      results.push({ platform, detected: true, configured: false });
      continue;
    }

    const configPathDisplay = platform.configPath.replace(homedir, '~');
    try {
      switch (platform.format) {
        case 'claude':
        case 'mcp-json':
          writeMcpJson(platform.configPath, apiKey);
          break;
        case 'vscode':
          writeVsCodeJson(platform.configPath, apiKey);
          break;
        case 'zed':
          writeZedJson(platform.configPath, apiKey);
          break;
        case 'toml':
          writeToml(platform.configPath, apiKey);
          break;
        default:
          throw new Error(`Unknown format: ${platform.format}`);
      }
      console.log(chalk.green(`  ✔ ${platform.name} → ${configPathDisplay} (configured)`));
      configured.push(platform.name);
      results.push({ platform, detected: true, configured: true });
    } catch (err) {
      console.log(chalk.red(`  ✗ ${platform.name} → ${configPathDisplay} (error: ${err.message})`));
      results.push({ platform, detected: true, configured: false, error: err.message });
    }
  }

  // Save config with platform list
  saveFathippoConfig(apiKey, configured);

  // Summary
  if (configured.length > 0) {
    console.log(chalk.green(`\nFatHippo is now connected to ${configured.length} coding platform(s).`));
    console.log(chalk.dim('Any coding agent in these platforms will automatically:'));
    console.log(chalk.dim('  • Recall relevant patterns and past solutions'));
    console.log(chalk.dim('  • Record coding traces for learning'));
    console.log(chalk.dim('  • Submit feedback to improve skills'));
  } else {
    console.log(chalk.yellow('\nNo platforms were configured.'));
    if (!options.platform) {
      console.log(chalk.dim('Install a supported coding platform and run setup again.'));
    }
  }

  console.log(chalk.dim('\nRun `fathippo setup --status` to check configuration.\n'));
}
