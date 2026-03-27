import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { PLATFORMS, isPlatformConfigured, detectOpenClaw, isOpenClawConfigured, readFathippoConfig } from './setup.js';

const homedir = os.homedir();
const backup_root = path.join(homedir, '.fathippo', 'backups');

function timestamp_id() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parse_target_csv(target_raw) {
  if (!target_raw) return null;
  return new Set(
    String(target_raw)
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

function matches_target(platform_name, target_set) {
  if (!target_set) return true;
  const normalized_name = platform_name.toLowerCase();
  return target_set.has(normalized_name);
}

function read_json(file_path) {
  if (!fs.existsSync(file_path)) return null;
  try {
    return JSON.parse(fs.readFileSync(file_path, 'utf-8'));
  } catch {
    return null;
  }
}

function write_json(file_path, data) {
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
  fs.writeFileSync(file_path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function clone_backup_file(source_path, backup_dir) {
  if (!fs.existsSync(source_path)) return null;
  const rel_path = source_path.startsWith(homedir)
    ? source_path.slice(homedir.length + 1)
    : source_path.replace(/^\//, '');
  const backup_path = path.join(backup_dir, rel_path);
  fs.mkdirSync(path.dirname(backup_path), { recursive: true });
  fs.copyFileSync(source_path, backup_path);
  return { source_path, backup_path };
}

function remove_mcp_json(config_path) {
  const existing = read_json(config_path);
  if (!existing || !existing.mcpServers?.fathippo) return false;
  delete existing.mcpServers.fathippo;
  write_json(config_path, existing);
  return true;
}

function remove_vscode_json(config_path) {
  const existing = read_json(config_path);
  if (!existing || !existing.servers?.fathippo) return false;
  delete existing.servers.fathippo;
  write_json(config_path, existing);
  return true;
}

function remove_zed_json(config_path) {
  const existing = read_json(config_path);
  if (!existing || !existing.context_servers?.fathippo) return false;
  delete existing.context_servers.fathippo;
  write_json(config_path, existing);
  return true;
}

function remove_toml(config_path) {
  if (!fs.existsSync(config_path)) return false;
  let content = fs.readFileSync(config_path, 'utf-8');
  const section_start = /\[mcp\.fathippo\]/;
  if (!section_start.test(content)) return false;

  const start_idx = content.search(section_start);
  const after_start = content.slice(start_idx);
  const end_match = after_start.match(/\n\[(?!mcp\.fathippo)/);

  if (end_match && end_match.index !== undefined) {
    content = content.slice(0, start_idx) + content.slice(start_idx + end_match.index + 1);
  } else {
    content = content.slice(0, start_idx);
  }

  fs.writeFileSync(config_path, content, 'utf-8');
  return true;
}

function remove_hermes_plugin(plugin_dir) {
  let removed = false;

  if (fs.existsSync(plugin_dir)) {
    fs.rmSync(plugin_dir, { recursive: true, force: true });
    removed = true;
  }

  const skill_dir = path.join(homedir, '.hermes', 'skills', 'fathippo');
  if (fs.existsSync(skill_dir)) {
    fs.rmSync(skill_dir, { recursive: true, force: true });
    removed = true;
  }

  const env_path = path.join(homedir, '.hermes', '.env');
  if (fs.existsSync(env_path)) {
    const env_content = fs.readFileSync(env_path, 'utf-8');
    if (/^FATHIPPO_API_KEY=.*$/m.test(env_content)) {
      const next_content = env_content.replace(/^FATHIPPO_API_KEY=.*\n?/m, '');
      fs.writeFileSync(env_path, next_content, 'utf-8');
      removed = true;
    }
  }

  return removed;
}

function remove_openclaw_integration() {
  try {
    execSync('openclaw config set plugins.slots.contextEngine ""', { stdio: 'pipe', timeout: 10000 });
    execSync('openclaw config set plugins.entries.fathippo-context-engine.config.apiKey ""', { stdio: 'pipe', timeout: 10000 });
    try {
      execSync('openclaw gateway restart', { stdio: 'pipe', timeout: 15000 });
    } catch {
      // ignore restart failures
    }
    return true;
  } catch {
    return false;
  }
}

async function prompt_confirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(message, resolve));
  rl.close();
  const normalized = String(answer).trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

function print_list(target_set = null) {
  console.log(chalk.cyan('\n🦛 FatHippo uninstall targets\n'));
  for (const platform of PLATFORMS) {
    if (!matches_target(platform.name, target_set)) continue;
    const detected = platform.detect();
    const configured = detected ? isPlatformConfigured(platform) : false;
    const status = configured
      ? chalk.green('configured')
      : detected
        ? chalk.yellow('detected, not configured')
        : chalk.dim('not detected');
    console.log(`  - ${platform.name}: ${status}`);
  }

  if (!target_set || target_set.has('openclaw')) {
    const detected = detectOpenClaw();
    const configured = detected ? isOpenClawConfigured() : false;
    const status = configured
      ? chalk.green('configured')
      : detected
        ? chalk.yellow('detected, not configured')
        : chalk.dim('not detected');
    console.log(`  - OpenClaw: ${status}`);
  }

  console.log();
}

function restore_from_backup(backup_id) {
  const manifest_path = path.join(backup_root, backup_id, 'manifest.json');
  if (!fs.existsSync(manifest_path)) {
    throw new Error(`Backup manifest not found: ${manifest_path}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'));
  const restored_paths = [];

  for (const file of manifest.files || []) {
    if (!file.source_path || !file.backup_path) continue;
    if (!fs.existsSync(file.backup_path)) continue;
    fs.mkdirSync(path.dirname(file.source_path), { recursive: true });
    fs.copyFileSync(file.backup_path, file.source_path);
    restored_paths.push(file.source_path);
  }

  console.log(chalk.green(`\n✔ Restored ${restored_paths.length} file(s) from backup ${backup_id}`));
  for (const restored_path of restored_paths) {
    console.log(chalk.dim(`  - ${restored_path.replace(homedir, '~')}`));
  }
  console.log();
}

export async function uninstall(options) {
  if (options.restore) {
    restore_from_backup(options.restore);
    return;
  }

  const target_set = parse_target_csv(options.target);

  if (options.list) {
    print_list(target_set);
    return;
  }

  const dry_run = Boolean(options.dryRun);
  const selected_platforms = PLATFORMS.filter((platform) => matches_target(platform.name, target_set));
  const include_openclaw = !target_set || target_set.has('openclaw');

  if (selected_platforms.length === 0 && !include_openclaw) {
    console.log(chalk.yellow('\nNo valid targets selected. Use --target with known platform names.\n'));
    return;
  }

  print_list(target_set);

  if (!dry_run && !options.yes) {
    const should_continue = await prompt_confirm(chalk.yellow('Proceed with uninstall? [y/N] '));
    if (!should_continue) {
      console.log(chalk.dim('\nAborted. No changes made.\n'));
      return;
    }
  }

  const backup_id = timestamp_id();
  const backup_dir = path.join(backup_root, backup_id);
  const file_backups = [];
  const actions = [];

  if (!dry_run) {
    fs.mkdirSync(backup_dir, { recursive: true });
  }

  console.log(chalk.cyan(`\n🧹 Running uninstall${dry_run ? ' (dry-run)' : ''}...\n`));

  for (const platform of selected_platforms) {
    const detected = platform.detect();
    const configured = detected ? isPlatformConfigured(platform) : false;

    if (!detected || !configured) {
      console.log(chalk.dim(`  - ${platform.name}: skipped`));
      continue;
    }

    const backup_candidates = [platform.configPath];
    if (platform.format === 'hermes-plugin') {
      backup_candidates.push(path.join(homedir, '.hermes', '.env'));
      backup_candidates.push(path.join(homedir, '.hermes', 'skills', 'fathippo', 'SKILL.md'));
    }

    if (!dry_run) {
      for (const candidate_path of backup_candidates) {
        const backup_file = clone_backup_file(candidate_path, backup_dir);
        if (backup_file) file_backups.push(backup_file);
      }
    }

    let removed = false;
    if (!dry_run) {
      switch (platform.format) {
        case 'claude':
        case 'mcp-json':
          removed = remove_mcp_json(platform.configPath);
          break;
        case 'vscode':
          removed = remove_vscode_json(platform.configPath);
          break;
        case 'zed':
          removed = remove_zed_json(platform.configPath);
          break;
        case 'toml':
          removed = remove_toml(platform.configPath);
          break;
        case 'hermes-plugin':
          removed = remove_hermes_plugin(platform.configPath);
          break;
        default:
          removed = false;
      }
    } else {
      removed = true;
    }

    actions.push({ platform: platform.name, removed });
    console.log(removed ? chalk.green(`  ✔ ${platform.name}: removed`) : chalk.red(`  ✗ ${platform.name}: failed`));
  }

  if (include_openclaw) {
    const detected = detectOpenClaw();
    const configured = detected ? isOpenClawConfigured() : false;

    if (!detected || !configured) {
      console.log(chalk.dim('  - OpenClaw: skipped'));
    } else {
      let removed = true;
      if (!dry_run) removed = remove_openclaw_integration();
      actions.push({ platform: 'OpenClaw', removed });
      console.log(removed ? chalk.green('  ✔ OpenClaw: removed') : chalk.red('  ✗ OpenClaw: failed'));
    }
  }

  const removed_count = actions.filter((action) => action.removed).length;

  if (!dry_run) {
    const manifest = {
      backup_id,
      created_at: new Date().toISOString(),
      files: file_backups,
      actions,
      restore_command: `npx fathippo uninstall --restore ${backup_id}`,
    };
    fs.writeFileSync(path.join(backup_dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

    // If this was an all-target uninstall, clear stored API key from local config.
    if (!target_set) {
      const config_path = path.join(homedir, '.fathippo', 'config.json');
      const existing_config = readFathippoConfig();
      if (existing_config?.apiKey) {
        const backup_file = clone_backup_file(config_path, backup_dir);
        if (backup_file) file_backups.push(backup_file);
        const next_config = { ...existing_config };
        delete next_config.apiKey;
        write_json(config_path, next_config);
      }
    }

    console.log(chalk.green(`\nRemoved FatHippo from ${removed_count} target(s).`));
    console.log(chalk.dim(`Backup ID: ${backup_id}`));
    console.log(chalk.dim(`Restore: npx fathippo uninstall --restore ${backup_id}\n`));
  } else {
    console.log(chalk.yellow(`\nDry-run complete. Would remove FatHippo from ${removed_count} target(s).\n`));
  }
}
