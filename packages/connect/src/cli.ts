import crypto from "node:crypto";
import os from "node:os";
import {
  copyToClipboard,
  defaultInstallationName,
  ensureOpenClawAvailable,
  installOpenClawContextEngine,
} from "./openclaw.js";

const CLI_VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://fathippo.ai/api";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 15 * 60 * 1000;

type OpenClawConnectOptions = {
  apiKey?: string;
  baseUrl: string;
  command: "openclaw";
  installationName: string;
  json: boolean;
  local: boolean;
  noRestart: boolean;
  namespace?: string;
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
  console.log(`Usage: npx @fathippo/connect openclaw [options]

Options:
  --local                 Configure local-only mode
  --api-key <key>         Use an existing hosted API key
  --namespace <name>      Shared FatHippo namespace to attach
  --base-url <url>        FatHippo API base URL (default: ${DEFAULT_BASE_URL})
  --installation-name <name>
                          Override the OpenClaw installation label
  --no-restart            Skip 'openclaw gateway restart'
  --json                  Print the final result as JSON
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
  if (command !== "openclaw") {
    if (command === "--help" || command === "-h" || typeof command === "undefined") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown command '${command}'. Only 'openclaw' is supported right now.`);
  }

  const options: OpenClawConnectOptions = {
    baseUrl: DEFAULT_BASE_URL,
    command: "openclaw",
    installationName: defaultInstallationName(),
    json: false,
    local: false,
    noRestart: false,
  };

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
}
