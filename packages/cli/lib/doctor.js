import os from 'os';
import chalk from 'chalk';
import {
  PLATFORMS,
  isPlatformConfigured,
  detectOpenClaw,
  isOpenClawConfigured,
  readFathippoConfig,
  validateApiKey,
} from './setup.js';

function mask_api_key(api_key) {
  if (!api_key) return null;
  if (api_key.length <= 10) return `${api_key.slice(0, 3)}...`;
  return `${api_key.slice(0, 6)}...${api_key.slice(-3)}`;
}

function checkmark(ok) {
  return ok ? chalk.green('✔') : chalk.red('✗');
}

function warnmark(ok) {
  return ok ? chalk.green('✔') : chalk.yellow('○');
}

function ms_since(start_ms) {
  return Date.now() - start_ms;
}

async function run_recall_smoke_test(api_key) {
  const started_at = Date.now();
  try {
    const res = await fetch('https://fathippo.ai/api/v1/simple/context', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'doctor readiness check: ping' }),
    });

    if (!res.ok) {
      return {
        ok: false,
        latency_ms: ms_since(started_at),
        status_code: res.status,
        detail: `HTTP ${res.status}`,
      };
    }

    const raw_body = await res.text().catch(() => '');
    const has_payload = typeof raw_body === 'string' && raw_body.trim().length > 0;

    return {
      ok: true,
      latency_ms: ms_since(started_at),
      status_code: res.status,
      detail: has_payload ? 'context endpoint responded' : 'context endpoint returned empty body',
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: ms_since(started_at),
      status_code: null,
      detail: err.message,
    };
  }
}

function detect_mcp_status() {
  const platforms = [];

  for (const platform of PLATFORMS) {
    const detected = platform.detect();
    const configured = detected ? isPlatformConfigured(platform) : false;

    platforms.push({
      name: platform.name,
      detected,
      configured,
      format: platform.format,
      config_path: platform.configPath,
    });
  }

  const detected_count = platforms.filter((p) => p.detected).length;
  const configured_count = platforms.filter((p) => p.configured).length;

  return {
    ok: configured_count > 0,
    detected_count,
    configured_count,
    platforms,
  };
}

function compute_degradation_mode({ auth_ok, recall_ok, mcp_ok }) {
  if (!auth_ok) return 'not_authenticated';
  if (!recall_ok) return 'api_unreachable';
  if (!mcp_ok) return 'api_ready_no_clients';
  return 'ready';
}

function build_recommended_fixes({ auth_ok, mcp_ok, recall_ok }) {
  const fixes = [];

  if (!auth_ok) {
    fixes.push('Run: npx fathippo setup');
    fixes.push('Or set FATHIPPO_API_KEY in your shell profile and re-run doctor.');
  }

  if (auth_ok && !mcp_ok) {
    fixes.push('No MCP clients are configured. Run: npx fathippo setup');
    fixes.push('Optional: target one platform with --platform "Claude Code" (or Codex/Cursor/etc).');
  }

  if (auth_ok && !recall_ok) {
    fixes.push('API key appears valid but recall endpoint failed — check network/VPN/firewall.');
    fixes.push('Retry in 30s: npx fathippo doctor');
  }

  if (fixes.length === 0) {
    fixes.push('No action needed. FatHippo is ready.');
  }

  return fixes;
}

function print_human_report(report) {
  console.log(chalk.cyan('\n🦛 FatHippo Doctor\n'));

  console.log(`${checkmark(report.cli_ok)} cli_ok: node ${report.node_version} on ${report.platform}`);

  const auth_label = report.auth_ok
    ? `configured (${report.api_key_masked})`
    : 'missing or invalid key';
  console.log(`${checkmark(report.auth_ok)} auth_ok: ${auth_label}`);

  const recall_suffix = report.recall_smoke_test.latency_ms != null
    ? ` (${report.recall_smoke_test.latency_ms}ms)`
    : '';
  const recall_label = report.recall_smoke_test.ok
    ? `context endpoint reachable${recall_suffix}`
    : `context endpoint failed${recall_suffix} — ${report.recall_smoke_test.detail}`;
  console.log(`${checkmark(report.recall_smoke_test.ok)} recall_smoke_test:${recall_label ? ' ' + recall_label : ''}`);

  const mcp_label = `${report.mcp.detected_count} detected, ${report.mcp.configured_count} configured`;
  console.log(`${warnmark(report.mcp.ok)} mcp_ok: ${mcp_label}`);

  const openclaw_state = report.openclaw.detected
    ? (report.openclaw.configured ? 'detected + configured' : 'detected, not configured')
    : 'not detected';
  console.log(`${warnmark(report.openclaw.configured)} openclaw_context_engine_ok: ${openclaw_state}`);

  console.log(`\ndegradation_mode: ${chalk.bold(report.degradation_mode)}`);

  console.log(chalk.dim('\nRecommended fixes:'));
  for (const fix of report.recommended_fixes) {
    console.log(chalk.dim(`  • ${fix}`));
  }
  console.log();
}

export async function doctor(options = {}) {
  const config = readFathippoConfig();
  const api_key = options.key || process.env.FATHIPPO_API_KEY || config.apiKey || null;

  const cli_ok = true;
  const node_version = process.version;
  const platform = `${os.platform()}-${os.arch()}`;

  const auth_ok = api_key ? await validateApiKey(api_key) : false;
  const mcp = detect_mcp_status();

  const openclaw_detected = detectOpenClaw();
  const openclaw_configured = openclaw_detected ? isOpenClawConfigured() : false;

  const recall_smoke_test = auth_ok
    ? await run_recall_smoke_test(api_key)
    : {
        ok: false,
        latency_ms: null,
        status_code: null,
        detail: 'skipped (auth not ready)',
      };

  const degradation_mode = compute_degradation_mode({
    auth_ok,
    recall_ok: recall_smoke_test.ok,
    mcp_ok: mcp.ok,
  });

  const recommended_fixes = build_recommended_fixes({
    auth_ok,
    mcp_ok: mcp.ok,
    recall_ok: recall_smoke_test.ok,
  });

  const report = {
    generated_at: new Date().toISOString(),
    cli_ok,
    node_version,
    platform,
    auth_ok,
    api_key_masked: mask_api_key(api_key),
    mcp,
    openclaw: {
      detected: openclaw_detected,
      configured: openclaw_configured,
    },
    recall_smoke_test,
    degradation_mode,
    recommended_fixes,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  print_human_report(report);
}
