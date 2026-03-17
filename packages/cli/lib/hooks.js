import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import chalk from "chalk";

const HOOK_MARKER_START = "# >>> fathippo post-commit hook";
const HOOK_MARKER_END = "# <<< fathippo post-commit hook";

const API_BASE = "https://www.fathippo.ai/api/v1";

function find_git_root() {
  try {
    return execSync("git rev-parse --show-toplevel", { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function resolve_api_key() {
  if (process.env.FATHIPPO_API_KEY) {
    return process.env.FATHIPPO_API_KEY;
  }

  const config_paths = [
    path.join(process.env.HOME || "~", ".fathippo", "config.json"),
    path.join(process.env.HOME || "~", ".config", "fathippo", "config.json"),
  ];

  for (const config_path of config_paths) {
    if (!fs.existsSync(config_path)) continue;
    try {
      const config = JSON.parse(fs.readFileSync(config_path, "utf-8"));
      if (config.apiKey) return config.apiKey;
    } catch {
      continue;
    }
  }

  return null;
}

function generate_hook_script() {
  return `
${HOOK_MARKER_START}
(
  # Run in background to avoid blocking the commit
  _fh_commit_hash=$(git log -1 --format="%H" 2>/dev/null)
  _fh_commit_msg=$(git log -1 --format="%s" 2>/dev/null)
  _fh_branch=$(git branch --show-current 2>/dev/null)
  _fh_diff_stat=$(git diff HEAD~1 --stat 2>/dev/null || echo "initial commit")
  _fh_repo_name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null)

  _fh_api_key="\${FATHIPPO_API_KEY:-}"

  # Try config file if env var not set
  if [ -z "$_fh_api_key" ]; then
    _fh_config="\${HOME}/.fathippo/config.json"
    if [ -f "$_fh_config" ]; then
      _fh_api_key=$(grep -o '"apiKey"[[:space:]]*:[[:space:]]*"[^"]*"' "$_fh_config" | head -1 | sed 's/.*"\\([^"]*\\)"$/\\1/')
    fi
  fi

  if [ -z "$_fh_api_key" ]; then
    exit 0
  fi

  _fh_text="Git commit in \${_fh_repo_name} on branch \${_fh_branch}:

Commit: \${_fh_commit_hash}
Message: \${_fh_commit_msg}

Files changed:
\${_fh_diff_stat}"

  curl -s -X POST "${API_BASE}/simple/remember" \\
    -H "Authorization: Bearer \${_fh_api_key}" \\
    -H "Content-Type: application/json" \\
    -d "$(printf '{"text": "%s"}' "$(echo "$_fh_text" | sed 's/"/\\\\"/g' | sed ':a;N;$!ba;s/\\n/\\\\n/g')")" \\
    > /dev/null 2>&1
) &
${HOOK_MARKER_END}
`.trim();
}

export async function hooks(subcommand, options) {
  if (subcommand === "install") {
    return install_hook(options);
  }

  if (subcommand === "remove") {
    return remove_hook(options);
  }

  console.log(chalk.yellow("Usage:"));
  console.log("  fathippo hooks install   Install git post-commit hook");
  console.log("  fathippo hooks remove    Remove git post-commit hook");
}

function install_hook(options) {
  const git_root = find_git_root();
  if (!git_root) {
    console.log(chalk.red("❌ Not a git repository"));
    return;
  }

  const api_key = options.key || resolve_api_key();
  if (!api_key) {
    console.log(chalk.red("❌ No API key found"));
    console.log(chalk.dim("Set FATHIPPO_API_KEY or use --key <key>"));
    return;
  }

  const hooks_dir = path.join(git_root, ".git", "hooks");
  const hook_path = path.join(hooks_dir, "post-commit");

  // Ensure hooks directory exists
  if (!fs.existsSync(hooks_dir)) {
    fs.mkdirSync(hooks_dir, { recursive: true });
  }

  const hook_script = generate_hook_script();

  // Check if hook file already exists
  if (fs.existsSync(hook_path)) {
    const existing = fs.readFileSync(hook_path, "utf-8");

    // Already installed — update in place
    if (existing.includes(HOOK_MARKER_START)) {
      const before = existing.split(HOOK_MARKER_START)[0];
      const after_parts = existing.split(HOOK_MARKER_END);
      const after = after_parts.length > 1 ? after_parts[1] : "";
      fs.writeFileSync(hook_path, before + hook_script + after, "utf-8");
      console.log(chalk.green("✅ FatHippo post-commit hook updated"));
      return;
    }

    // Append to existing hook
    const content = existing.trimEnd() + "\n\n" + hook_script + "\n";
    fs.writeFileSync(hook_path, content, "utf-8");
  } else {
    // Create new hook file
    const content = "#!/bin/sh\n\n" + hook_script + "\n";
    fs.writeFileSync(hook_path, content, "utf-8");
  }

  // Make executable
  fs.chmodSync(hook_path, "755");

  const repo_name = path.basename(git_root);
  console.log(chalk.green(`✅ FatHippo post-commit hook installed in ${repo_name}`));
  console.log(chalk.dim(`   Path: ${hook_path}`));
  console.log(
    chalk.dim("   Commits will be captured as memories in the background")
  );
}

function remove_hook(options) {
  const git_root = find_git_root();
  if (!git_root) {
    console.log(chalk.red("❌ Not a git repository"));
    return;
  }

  const hook_path = path.join(git_root, ".git", "hooks", "post-commit");
  if (!fs.existsSync(hook_path)) {
    console.log(chalk.yellow("No post-commit hook found"));
    return;
  }

  const existing = fs.readFileSync(hook_path, "utf-8");

  if (!existing.includes(HOOK_MARKER_START)) {
    console.log(chalk.yellow("No FatHippo hook found in post-commit"));
    return;
  }

  const before = existing.split(HOOK_MARKER_START)[0];
  const after_parts = existing.split(HOOK_MARKER_END);
  const after = after_parts.length > 1 ? after_parts[1] : "";
  const cleaned = (before + after).trim();

  // If only the shebang remains, remove the file entirely
  if (!cleaned || cleaned === "#!/bin/sh" || cleaned === "#!/bin/bash") {
    fs.unlinkSync(hook_path);
    console.log(chalk.green("✅ Post-commit hook removed"));
    return;
  }

  fs.writeFileSync(hook_path, cleaned + "\n", "utf-8");
  console.log(chalk.green("✅ FatHippo hook removed (other hooks preserved)"));
}
