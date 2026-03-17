import crypto from "node:crypto";
import os from "node:os";
import {
  copyToClipboard,
  defaultInstallationName,
  ensureOpenClawAvailable,
  installOpenClawContextEngine,
} from "./openclaw.js";
import { install_hooks, remove_hooks } from "./hooks.js";

const CLI_VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://fathippo.ai/api";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 15 * 60 * 1000;

type OpenClawConnectOptions = {
  apiKey?: string;
  baseUrl: string;
  command: "openclaw" | "profile" | "hooks";
  installationName: string;
  json: boolean;
  local: boolean;
  noRestart: boolean;
  namespace?: string;
  // Profile command options
  profilePath?: string;
  force?: boolean;
  quiet?: boolean;
};

type StartConnectResponse = {
  connectId: string;
  expiresAt: string;
  loginUrl: string;
  pollIntervalMs?: number;
  pollToken: string;
  userCode: string;
};

type PollPendingResponse = {
  status: "pending";
  expiresAt: string;
};

type PollAuthorizedResponse = {
  status: "authorized";
  apiKey: string;
  baseUrl: string;
  installationId: string;
  namespace: string | null;
};

type PollTerminalResponse = {
  status: "expired" | "consumed";
  error?: string;
};

type PollResponse = PollPendingResponse | PollAuthorizedResponse | PollTerminalResponse;

function printHelp(): void {
  console.log(`Usage: npx @fathippo/connect <command> [options]

Commands:
  openclaw                Connect FatHippo to OpenClaw
  profile [path-or-url]   Profile a codebase and generate .fathippo/codebase-profile.json
  hooks install           Install git post-commit hook to auto-capture commits
  hooks remove            Remove FatHippo git post-commit hook

openclaw options:
  --local                 Configure local-only mode
  --api-key <key>         Use an existing hosted API key
  --namespace <name>      Shared FatHippo namespace to attach
  --base-url <url>        FatHippo API base URL (default: ${DEFAULT_BASE_URL})
  --installation-name <name>
                          Override the OpenClaw installation label
  --no-restart            Skip 'openclaw gateway restart'
  --json                  Print the final result as JSON

profile options:
  --force                 Regenerate even if a fresh profile exists
  --quiet                 Suppress output (for background usage)
  --json                  Print the profile as JSON

  --help                  Show this help`);
}

function expectValue(
  args: string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return { value, nextIndex: index + 1 };
}

function parseArgs(argv: string[]): OpenClawConnectOptions {
  const command = argv[0];
  if (command !== "openclaw" && command !== "profile" && command !== "hooks") {
    if (command === "--help" || command === "-h" || typeof command === "undefined") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown command '${command}'. Supported: openclaw, profile, hooks. Use --help for usage.`);
  }

  const options: OpenClawConnectOptions = {
    baseUrl: DEFAULT_BASE_URL,
    command: command as "openclaw" | "profile" | "hooks",
    installationName: defaultInstallationName(),
    json: false,
    local: false,
    noRestart: false,
  };

  if (command === "profile") {
    return parseProfileArgs(argv, options);
  }

  if (command === "hooks") {
    return options;
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      case "--local":
        options.local = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--no-restart":
        options.noRestart = true;
        break;
      case "--api-key": {
        const { value, nextIndex } = expectValue(argv, index, arg);
        options.apiKey = value;
        index = nextIndex;
        break;
      }
      case "--namespace": {
        const { value, nextIndex } = expectValue(argv, index, arg);
        options.namespace = value;
        index = nextIndex;
        break;
      }
      case "--base-url": {
        const { value, nextIndex } = expectValue(argv, index, arg);
        options.baseUrl = value;
        index = nextIndex;
        break;
      }
      case "--installation-name": {
        const { value, nextIndex } = expectValue(argv, index, arg);
        options.installationName = value;
        index = nextIndex;
        break;
      }
      default:
        throw new Error(`Unknown flag '${arg}'. Use --help for usage.`);
    }
  }

  if (options.local && options.apiKey) {
    throw new Error("Use either --local or --api-key, not both.");
  }

  return options;
}

function parseProfileArgs(argv: string[], options: OpenClawConnectOptions): OpenClawConnectOptions {
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      case "--force":
        options.force = true;
        break;
      case "--quiet":
        options.quiet = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag '${arg}' for profile command. Use --help for usage.`);
        }
        // Positional argument: path or URL
        options.profilePath = arg;
        break;
    }
  }

  // Default to current directory
  if (!options.profilePath) {
    options.profilePath = ".";
  }

  return options;
}

async function promptForRepo(): Promise<string | null> {
  const rl = await import("node:readline");
  const iface = rl.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    console.log("");
    console.log("What repo should FatHippo learn? (optional)");
    console.log("  Paste a GitHub URL or local path, or press Enter to skip.");
    console.log("");
    iface.question("> ", (answer) => {
      iface.close();
      const trimmed = answer.trim();
      resolve(trimmed || null);
    });
  });
}

async function profileRepo(repoInput: string, options?: { force?: boolean; quiet?: boolean; json?: boolean }): Promise<void> {
  const { execSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const { profileCodebase } = await import("./profiler/index.js");

  const log = options?.quiet ? (() => {}) : console.log.bind(console);

  let workDir = repoInput;
  let tempDir: string | null = null;

  // If it looks like a URL, clone it to a temp dir
  const isUrl = repoInput.startsWith("http://") || repoInput.startsWith("https://") || repoInput.startsWith("git@");
  if (isUrl) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fathippo-profile-"));
    log("Cloning repository...");
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["clone", "--depth", "50", repoInput, `${tempDir}/repo`], { stdio: "pipe" });
      workDir = path.join(tempDir, "repo");
    } catch (err) {
      console.error("⚠ Clone failed — the repo may be private or the URL is incorrect.");
      console.error("  If it's a private repo, use a local path instead: ~/path/to/repo");
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      return;
    }
  }

  // Resolve to absolute path
  workDir = path.resolve(workDir);

  // Verify it's a git repo
  if (!fs.existsSync(path.join(workDir, ".git"))) {
    console.error("Not a git repository. Please provide a path to a git project.");
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    return;
  }

  log("Profiling codebase...");
  try {
    const profile = await profileCodebase(workDir, { force: options?.force });

    if (options?.json) {
      console.log(JSON.stringify(profile, null, 2));
    } else {
      const languages = profile.techStack.languages || [];
      const frameworks = profile.techStack.frameworks || [];
      const totalFiles = profile.structure?.totalFiles || 0;

      const langStr = languages.slice(0, 3).map((l: { name: string; percentage: number }) => `${l.name} ${l.percentage}%`).join(", ");
      const fwStr = frameworks.length > 0 ? `, ${frameworks.join(", ")}` : "";

      log(`✅ Profiled: ${langStr}${fwStr} · ${totalFiles} files`);
      log(`   Saved to ${workDir}/.fathippo/codebase-profile.json`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`⚠ Profiling failed: ${message}`);
  }

  // Clean up temp clone
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function promptForMode(): Promise<"local" | "hosted"> {
  const rl = await import("node:readline");
  const iface = rl.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    console.log("");
    console.log("How do you want to use FatHippo?");
    console.log("");
    console.log("  [1] Free (local-only) — memories stay on your machine, no account needed");
    console.log("  [2] Hosted ($4.99/mo) — cloud sync, cognitive features, cross-device memory");
    console.log("");
    iface.question("Choose [1/2]: ", (answer) => {
      iface.close();
      const trimmed = answer.trim();
      if (trimmed === "1" || trimmed.toLowerCase() === "local" || trimmed.toLowerCase() === "free") {
        resolve("local");
      } else {
        resolve("hosted");
      }
    });
  });
}

async function postJson<T>(url: URL, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Connect request failed (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

async function getJson<T>(url: URL, token: string): Promise<{ status: number; body: T }> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text().catch(() => "");
  let body: T;
  try {
    body = (text ? JSON.parse(text) : {}) as T;
  } catch {
    body = { error: text } as T;
  }
  return { status: response.status, body };
}

function connectApiUrl(baseUrl: string, pathname: string): URL {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

async function startHostedConnect(options: OpenClawConnectOptions): Promise<StartConnectResponse> {
  const startUrl = connectApiUrl(options.baseUrl, "/api/connect/openclaw/start");
  return postJson<StartConnectResponse>(startUrl, {
    arch: os.arch(),
    cliVersion: CLI_VERSION,
    installationName: options.installationName,
    mode: "hosted",
    namespaceHint: options.namespace,
    platform: os.platform(),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForAuthorization(
  options: OpenClawConnectOptions,
  start: StartConnectResponse,
): Promise<PollAuthorizedResponse> {
  const pollUrl = connectApiUrl(options.baseUrl, "/api/connect/openclaw/poll");
  pollUrl.searchParams.set("connectId", start.connectId);

  const startedAt = Date.now();
  const intervalMs = Math.max(start.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, 1000);

  for (;;) {
    const { status, body } = await getJson<PollResponse>(pollUrl, start.pollToken);

    if (status === 200 && body.status === "authorized") {
      return body;
    }

    if (status === 202 && body.status === "pending") {
      if (Date.now() - startedAt > DEFAULT_POLL_TIMEOUT_MS) {
        throw new Error("Timed out waiting for browser authorization.");
      }
      await sleep(intervalMs);
      continue;
    }

    if ((status === 410 || status === 409) && (body.status === "expired" || body.status === "consumed")) {
      throw new Error(body.error ?? `Connect session ${body.status}. Start a fresh install and try again.`);
    }

    const error = (body as { error?: string }).error;
    throw new Error(error || `Unexpected authorization response (${status}).`);
  }
}

function printJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload, null, 2));
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);

  // Handle profile command separately
  if (options.command === "profile") {
    await profileRepo(options.profilePath || ".", {
      force: options.force,
      quiet: options.quiet,
      json: options.json,
    });
    return;
  }

  // Handle hooks command
  if (options.command === "hooks") {
    const sub_command = argv[1];
    if (sub_command === "install") {
      await install_hooks(process.cwd());
    } else if (sub_command === "remove" || sub_command === "uninstall") {
      await remove_hooks(process.cwd());
    } else {
      console.log("Usage: fathippo-connect hooks <install|remove>");
    }
    return;
  }

  await ensureOpenClawAvailable();

  // If no mode specified, ask the user
  if (!options.local && !options.apiKey) {
    const mode = await promptForMode();
    if (mode === "local") {
      options.local = true;
    }
  }

  if (options.local) {
    await installOpenClawContextEngine({
      mode: "local",
      noRestart: options.noRestart,
    });

    if (options.json) {
      printJson({
        baseUrl: null,
        installationId: null,
        mode: "local",
        namespace: null,
        restarted: !options.noRestart,
      });
      return;
    }

    console.log("FatHippo is connected to OpenClaw in local-only mode.");

    // Ask if they want to profile a repo
    const repo = await promptForRepo();
    if (repo) {
      await profileRepo(repo);
    }
    return;
  }

  let apiKey = options.apiKey?.trim();
  let installationId = `oc_${crypto.randomUUID().replaceAll("-", "")}`;
  let namespace = options.namespace?.trim() || null;
  let baseUrl = options.baseUrl;

  if (!apiKey) {
    console.log("Checking OpenClaw...");
    console.log("Creating secure login link...");

    const start = await startHostedConnect(options);
    const copied = await copyToClipboard(start.loginUrl);

    console.log(copied ? "Link copied to your clipboard." : "Clipboard unavailable. Copy the link below manually.");
    console.log("");
    console.log("Finish login in your browser:");
    console.log(start.loginUrl);
    console.log("");
    console.log(`Authorization code: ${start.userCode}`);
    console.log("");
    console.log("Waiting for authorization...");

    const authorized = await waitForAuthorization(options, start);
    apiKey = authorized.apiKey;
    installationId = authorized.installationId;
    namespace = authorized.namespace;
    baseUrl = authorized.baseUrl || options.baseUrl;
  }

  await installOpenClawContextEngine({
    apiKey,
    baseUrl,
    installationId,
    mode: "hosted",
    namespace: namespace ?? undefined,
    noRestart: options.noRestart,
  });

  if (options.json) {
    printJson({
      baseUrl,
      installationId,
      mode: "hosted",
      namespace,
      restarted: !options.noRestart,
    });
    return;
  }

  console.log(options.noRestart ? "FatHippo is configured for OpenClaw." : "FatHippo is connected to OpenClaw.");

  // Ask if they want to profile a repo
  const repo = await promptForRepo();
  if (repo) {
    await profileRepo(repo);
  }
}
