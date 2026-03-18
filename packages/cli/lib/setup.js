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
  {
    name: 'Antigravity',
    detect: () =>
      existsSync(path.join(homedir, '.gemini', 'antigravity')),
    configPath: path.join(homedir, '.gemini', 'antigravity', 'mcp_config.json'),
    format: 'mcp-json',
  },
  {
    name: 'Trae',
    detect: () =>
      existsSync(path.join(homedir, '.trae')) || commandExists('trae'),
    configPath: path.join(homedir, '.trae', 'mcp.json'),
    format: 'mcp-json',
  },
  {
    name: 'Hermes Agent',
    detect: () =>
      existsSync(path.join(homedir, '.hermes')) || commandExists('hermes'),
    configPath: path.join(homedir, '.hermes', 'plugins', 'fathippo'),
    format: 'hermes-plugin',
  },
  {
    name: 'Qoder',
    detect: () => {
      // macOS: ~/Library/Application Support/Qoder
      // Linux: ~/.config/Qoder
      const macPath = path.join(homedir, 'Library', 'Application Support', 'Qoder');
      const linuxPath = path.join(homedir, '.config', 'Qoder');
      return existsSync(macPath) || existsSync(linuxPath) || commandExists('qoder');
    },
    configPath: process.platform === 'darwin'
      ? path.join(homedir, 'Library', 'Application Support', 'Qoder', 'SharedClientCache', 'mcp.json')
      : path.join(homedir, '.config', 'Qoder', 'SharedClientCache', 'mcp.json'),
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

/**
 * Install FatHippo as a native Hermes plugin.
 * Copies Python plugin files to ~/.hermes/plugins/fathippo/
 * and SKILL.md to ~/.hermes/skills/fathippo/
 * Also writes the API key to ~/.hermes/.env if not already present.
 */
function writeHermesPlugin(pluginDir, apiKey) {
  // Find our integration files (shipped inside the npm package)
  const cliRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
  const hermesIntegrationDir = path.join(cliRoot, 'integrations', 'hermes');

  // Verify integration files exist
  const requiredFiles = ['plugin.yaml', '__init__.py', 'schemas.py', 'tools.py', 'skill.md'];
  for (const file of requiredFiles) {
    const filePath = path.join(hermesIntegrationDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing integration file: ${file} (expected at ${filePath})`);
    }
  }

  // Copy plugin files to ~/.hermes/plugins/fathippo/
  fs.mkdirSync(pluginDir, { recursive: true });
  const pluginFiles = ['plugin.yaml', '__init__.py', 'schemas.py', 'tools.py'];
  for (const file of pluginFiles) {
    fs.copyFileSync(
      path.join(hermesIntegrationDir, file),
      path.join(pluginDir, file)
    );
  }

  // Copy skill to ~/.hermes/skills/fathippo/SKILL.md
  const skillDir = path.join(homedir, '.hermes', 'skills', 'fathippo');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.copyFileSync(
    path.join(hermesIntegrationDir, 'skill.md'),
    path.join(skillDir, 'SKILL.md')
  );

  // Write API key to ~/.hermes/.env (append if not already there)
  const envPath = path.join(homedir, '.hermes', '.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  if (envContent.includes('FATHIPPO_API_KEY')) {
    // Replace existing key
    envContent = envContent.replace(
      /^FATHIPPO_API_KEY=.*$/m,
      `FATHIPPO_API_KEY=${apiKey}`
    );
  } else {
    // Append
    const separator = envContent.length > 0 && !envContent.endsWith('\n') ? '\n' : '';
    envContent += `${separator}FATHIPPO_API_KEY=${apiKey}\n`;
  }
  fs.writeFileSync(envPath, envContent, 'utf-8');
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

function removeHermesPlugin(pluginDir) {
  let removed = false;

  // Remove plugin directory
  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true, force: true });
    removed = true;
  }

  // Remove skill directory
  const skillDir = path.join(homedir, '.hermes', 'skills', 'fathippo');
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
    removed = true;
  }

  // Remove API key from .env (leave other keys intact)
  const envPath = path.join(homedir, '.hermes', '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf-8');
    if (envContent.includes('FATHIPPO_API_KEY')) {
      envContent = envContent.replace(/^FATHIPPO_API_KEY=.*\n?/m, '');
      fs.writeFileSync(envPath, envContent, 'utf-8');
      removed = true;
    }
  }

  return removed;
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
      case 'hermes-plugin': {
        // Check if plugin files exist
        return fs.existsSync(path.join(platform.configPath, 'plugin.yaml'));
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ─── OpenClaw integration ─────────────────────────────────────────────────────

function detectOpenClaw() {
  return existsSync(path.join(homedir, '.openclaw')) || commandExists('openclaw');
}

function isOpenClawConfigured() {
  try {
    const result = execSync('openclaw config get plugins.slots.contextEngine', {
      stdio: 'pipe',
      timeout: 10000,
    }).toString().trim();
    return result.includes('fathippo');
  } catch {
    return false;
  }
}

function configureOpenClaw(apiKey) {
  // Install the context engine plugin (skip if already installed)
  try {
    execSync('openclaw plugins install @fathippo/fathippo-context-engine', {
      stdio: 'pipe',
      timeout: 60000,
    });
  } catch (e) {
    const msg = e.stderr?.toString() || e.message || '';
    if (!msg.includes('already exists')) throw e;
    // Already installed — continue with configuration
  }

  // Set it as the active context engine
  execSync('openclaw config set plugins.slots.contextEngine fathippo-context-engine', {
    stdio: 'pipe',
    timeout: 10000,
  });

  // Configure hosted mode with API key
  execSync('openclaw config set plugins.entries.fathippo-context-engine.config.mode hosted', {
    stdio: 'pipe',
    timeout: 10000,
  });
  execSync(`openclaw config set plugins.entries.fathippo-context-engine.config.apiKey ${apiKey}`, {
    stdio: 'pipe',
    timeout: 10000,
  });
  execSync('openclaw config set plugins.entries.fathippo-context-engine.config.baseUrl https://fathippo.ai/api', {
    stdio: 'pipe',
    timeout: 10000,
  });
  execSync('openclaw config set plugins.entries.fathippo-context-engine.config.injectCritical true', {
    stdio: 'pipe',
    timeout: 10000,
  });

  // Restart the gateway
  try {
    execSync('openclaw gateway restart', { stdio: 'pipe', timeout: 15000 });
  } catch {
    // Gateway restart may fail if not running — that's fine
  }
}

function removeOpenClaw() {
  try {
    execSync('openclaw config set plugins.slots.contextEngine ""', {
      stdio: 'pipe',
      timeout: 10000,
    });
    return true;
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

// ─── Device code authentication flow ─────────────────────────────────────────

// Node 18+ has global fetch. This flow opens a browser for the user to authorize
// the CLI without manually copying an API key from the dashboard.
async function authenticateWithDeviceFlow() {
  const spinner = ora('Generating device code...').start();

  try {
    // Request device code
    const res = await fetch('https://fathippo.ai/api/v1/auth/device', {
      method: 'POST',
    });

    if (!res.ok) {
      spinner.fail('Failed to generate device code');
      return null;
    }

    const data = await res.json();
    spinner.stop();

    console.log();
    console.log(chalk.bold('  To authenticate, visit:'));
    console.log(chalk.cyan(`  ${data.verification_uri}`));
    console.log();
    console.log(chalk.bold('  And enter this code:'));
    console.log(chalk.cyan.bold(`  ${data.user_code}`));
    console.log();

    // Try to open browser automatically
    const open_cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try {
      execSync(`${open_cmd} ${data.verification_uri}`, { stdio: 'pipe' });
      console.log(chalk.dim('  (Browser opened automatically)'));
    } catch {
      // Browser didn't open — user will navigate manually
    }
    console.log();

    // Poll for completion
    const poll_spinner = ora('Waiting for authorization...').start();
    const poll_interval = (data.interval ?? 5) * 1000;
    const max_attempts = Math.ceil((data.expires_in ?? 900) / (data.interval ?? 5));

    for (let i = 0; i < max_attempts; i++) {
      await new Promise(resolve => setTimeout(resolve, poll_interval));

      try {
        const poll_res = await fetch(`https://fathippo.ai/api/v1/auth/device?device_code=${data.device_code}`);
        const poll_data = await poll_res.json();

        if (poll_data.status === 'authorized') {
          poll_spinner.succeed('Authenticated!');
          return poll_data.api_key;
        }

        if (poll_res.status === 410) {
          poll_spinner.fail('Code expired. Please try again.');
          return null;
        }

        // Still pending — continue polling
      } catch {
        // Network error — retry
      }
    }

    poll_spinner.fail('Timed out waiting for authorization.');
    return null;
  } catch (err) {
    spinner.fail(`Device auth error: ${err.message}`);
    return null;
  }
}

async function validateApiKey(key) {
  try {
    const res = await fetch('https://fathippo.ai/api/v1/simple/context', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'ping' }),
    });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

// ─── Status command ───────────────────────────────────────────────────────────

async function showStatus() {
  console.log(chalk.cyan('\n🦛 FatHippo Setup Status\n'));

  const config = readFathippoConfig();
  if (config.apiKey) {
    const masked =
      config.apiKey.length > 8
        ? config.apiKey.slice(0, 6) + '...' + config.apiKey.slice(-3)
        : config.apiKey;
    const valid = await validateApiKey(config.apiKey);
    if (valid) {
      console.log(chalk.green(`API Key: ✔ Valid (${masked})`));
    } else {
      console.log(chalk.yellow(`API Key: ⚠ Invalid or expired (${masked}) — run 'npx fathippo setup' to re-authenticate`));
    }
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
      const method = platform.format === 'hermes-plugin' ? 'native plugin' : 'MCP';
      console.log(chalk.green(`  ✔ ${platform.name} — configured (${method})`));
    } else {
      console.log(chalk.yellow(`  ○ ${platform.name} — detected, not configured`));
    }
  }

  // OpenClaw status
  if (detectOpenClaw()) {
    const ocConfigured = isOpenClawConfigured();
    if (ocConfigured) {
      console.log(chalk.green(`  ✔ OpenClaw — configured (context engine plugin)`));
    } else {
      console.log(chalk.yellow(`  ○ OpenClaw — detected, not configured`));
    }
  } else {
    console.log(chalk.dim(`  ✗ OpenClaw — not detected`));
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
        case 'hermes-plugin':
          ok = removeHermesPlugin(platform.configPath);
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

  // Remove OpenClaw if no filter or filtering for openclaw
  if (!platformFilter || platformFilter.toLowerCase() === 'openclaw') {
    if (removeOpenClaw()) {
      console.log(chalk.green('  ✔ OpenClaw — removed'));
      removed++;
    } else {
      console.log(chalk.dim('  ✗ OpenClaw — not configured, skipped'));
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
      // Validate the existing key before using it
      const valid = await validateApiKey(existingConfig.apiKey);
      if (valid) {
        apiKey = existingConfig.apiKey;
        console.log(chalk.green('✔ Existing API key is valid'));
      } else {
        console.log(chalk.yellow('Existing API key is invalid or expired. Re-authenticating...'));
      }
    }
  }

  if (!apiKey) {
    // 4. Device code flow (preferred — opens browser for seamless auth)
    console.log(chalk.yellow('\nNo API key found. Starting device authentication...\n'));
    apiKey = await authenticateWithDeviceFlow();

    // 5. Fall back to manual entry if device flow fails or is unavailable
    // (e.g., SSH sessions without a browser, or self-hosted instances)
    if (!apiKey) {
      console.log(chalk.dim('\nDevice auth unavailable. Enter key manually:'));
      console.log(chalk.dim('Get your API key at https://fathippo.ai/dashboard/settings\n'));
      apiKey = await promptApiKey();
    }
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
        case 'hermes-plugin':
          writeHermesPlugin(platform.configPath, apiKey);
          break;
        default:
          throw new Error(`Unknown format: ${platform.format}`);
      }
      const setupMethod = platform.format === 'hermes-plugin' ? 'native plugin + skill' : 'MCP';
      console.log(chalk.green(`  ✔ ${platform.name} → ${configPathDisplay} (${setupMethod})`));
      configured.push(platform.name);
      results.push({ platform, detected: true, configured: true });
    } catch (err) {
      console.log(chalk.red(`  ✗ ${platform.name} → ${configPathDisplay} (error: ${err.message})`));
      results.push({ platform, detected: true, configured: false, error: err.message });
    }
  }

  // OpenClaw integration (uses context engine plugin, not MCP)
  const shouldConfigureOpenClaw = !options.platform || options.platform.toLowerCase() === 'openclaw';
  if (shouldConfigureOpenClaw && detectOpenClaw()) {
    const ocSpinner = ora('Installing OpenClaw context engine plugin...').start();
    try {
      configureOpenClaw(apiKey);
      ocSpinner.succeed('OpenClaw → context engine plugin (installed + configured)');
      configured.push('OpenClaw');
    } catch (err) {
      ocSpinner.fail(`OpenClaw — error: ${err.message}`);
    }
  } else if (!options.platform && !detectOpenClaw()) {
    // Only show "not detected" if we're not filtering
    // (already shown in the MCP platforms loop above)
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
