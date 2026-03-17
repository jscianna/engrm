/**
 * Git hooks management for FatHippo.
 *
 * Installs/removes a post-commit hook that auto-captures
 * commit context and sends it to FatHippo's remember API.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const HOOK_MARKER_START = "# --- FatHippo post-commit hook start ---";
const HOOK_MARKER_END = "# --- FatHippo post-commit hook end ---";

function resolve_api_key(): string | null {
  // 1. Environment variable
  const env_key = process.env.FATHIPPO_API_KEY?.trim();
  if (env_key) return env_key;

  // 2. Config file
  try {
    const config_path = path.join(os.homedir(), ".fathippo", "config.json");
    const config = JSON.parse(fs.readFileSync(config_path, "utf-8"));
    return config.apiKey?.trim() || null;
  } catch {
    return null;
  }
}

function resolve_base_url(): string {
  return process.env.FATHIPPO_BASE_URL?.trim() || "https://fathippo.ai/api";
}

function find_git_dir(start_dir: string): string | null {
  let dir = path.resolve(start_dir);
  for (let i = 0; i < 20; i++) {
    const git_path = path.join(dir, ".git");
    if (fs.existsSync(git_path)) return git_path;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function build_hook_script(): string {
  const api_key = resolve_api_key();
  const base_url = resolve_base_url();

  // The hook reads API key from env first, falls back to config, then to inline
  return `${HOOK_MARKER_START}
# Auto-capture commits to FatHippo memory (runs in background)
(
  _fh_key="\${FATHIPPO_API_KEY:-}"
  if [ -z "$_fh_key" ] && [ -f "$HOME/.fathippo/config.json" ]; then
    _fh_key=$(grep -o '"apiKey"[[:space:]]*:[[:space:]]*"[^"]*"' "$HOME/.fathippo/config.json" 2>/dev/null | head -1 | sed 's/.*"apiKey"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/')
  fi
  ${api_key ? `[ -z "$_fh_key" ] && _fh_key="${api_key}"` : ""}
  [ -z "$_fh_key" ] && exit 0

  _fh_url="${base_url}/v1/simple/remember"
  _fh_hash=$(git log -1 --format="%H" 2>/dev/null)
  _fh_msg=$(git log -1 --format="%s" 2>/dev/null)
  _fh_branch=$(git branch --show-current 2>/dev/null)
  _fh_stat=$(git diff HEAD~1 --stat 2>/dev/null | tail -1)
  _fh_files=$(git diff HEAD~1 --name-only 2>/dev/null | head -20 | tr '\\n' ', ')
  _fh_repo=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")

  _fh_text="[Git commit] $_fh_repo/$_fh_branch: $_fh_msg | Files: $_fh_files| Stats: $_fh_stat | Hash: \${_fh_hash:0:8}"

  curl -s -X POST "$_fh_url" \\
    -H "Authorization: Bearer $_fh_key" \\
    -H "Content-Type: application/json" \\
    -d "{\\"text\\": $(printf '%s' "$_fh_text" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '\\"$_fh_text\\"')}" \\
    >/dev/null 2>&1
) &
${HOOK_MARKER_END}`;
}

export async function install_hooks(target_dir: string): Promise<void> {
  const git_dir = find_git_dir(target_dir);
  if (!git_dir) {
    console.error("❌ Not a git repository. Run this from inside a git project.");
    process.exitCode = 1;
    return;
  }

  const api_key = resolve_api_key();
  if (!api_key) {
    console.error("❌ No FatHippo API key found.");
    console.error("   Set FATHIPPO_API_KEY or run: npx @fathippo/connect openclaw");
    process.exitCode = 1;
    return;
  }

  const hooks_dir = path.join(git_dir, "hooks");
  if (!fs.existsSync(hooks_dir)) {
    fs.mkdirSync(hooks_dir, { recursive: true });
  }

  const hook_path = path.join(hooks_dir, "post-commit");
  const hook_script = build_hook_script();

  if (fs.existsSync(hook_path)) {
    const existing = fs.readFileSync(hook_path, "utf-8");

    // Already installed — update in place
    if (existing.includes(HOOK_MARKER_START)) {
      const before = existing.split(HOOK_MARKER_START)[0] ?? "";
      const after_marker = existing.split(HOOK_MARKER_END);
      const after = after_marker.length > 1 ? after_marker[1] : "";
      fs.writeFileSync(hook_path, before + hook_script + after, { mode: 0o755 });
      console.log("✅ FatHippo post-commit hook updated.");
      return;
    }

    // Existing hook without FatHippo — append
    const updated = existing.trimEnd() + "\n\n" + hook_script + "\n";
    fs.writeFileSync(hook_path, updated, { mode: 0o755 });
    console.log("✅ FatHippo post-commit hook appended to existing hook.");
  } else {
    // No existing hook — create new
    fs.writeFileSync(hook_path, "#!/bin/sh\n\n" + hook_script + "\n", { mode: 0o755 });
    console.log("✅ FatHippo post-commit hook installed.");
  }

  const repo_root = path.dirname(git_dir);
  const repo_name = path.basename(repo_root);
  console.log(`   Repo: ${repo_name}`);
  console.log("   Every commit will now be captured to FatHippo memory.");
}

export async function remove_hooks(target_dir: string): Promise<void> {
  const git_dir = find_git_dir(target_dir);
  if (!git_dir) {
    console.error("❌ Not a git repository.");
    process.exitCode = 1;
    return;
  }

  const hook_path = path.join(git_dir, "hooks", "post-commit");
  if (!fs.existsSync(hook_path)) {
    console.log("No post-commit hook found. Nothing to remove.");
    return;
  }

  const existing = fs.readFileSync(hook_path, "utf-8");
  if (!existing.includes(HOOK_MARKER_START)) {
    console.log("No FatHippo hook found in post-commit. Nothing to remove.");
    return;
  }

  const before = existing.split(HOOK_MARKER_START)[0] ?? "";
  const after_marker = existing.split(HOOK_MARKER_END);
  const after = after_marker.length > 1 ? after_marker[1] : "";
  const cleaned = (before + after).trim();

  if (!cleaned || cleaned === "#!/bin/sh") {
    // Hook was only FatHippo — remove the file
    fs.unlinkSync(hook_path);
    console.log("✅ FatHippo post-commit hook removed (file deleted).");
  } else {
    fs.writeFileSync(hook_path, cleaned + "\n", { mode: 0o755 });
    console.log("✅ FatHippo post-commit hook removed (other hooks preserved).");
  }
}
