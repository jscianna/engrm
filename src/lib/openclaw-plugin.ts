import { readFile } from "node:fs/promises";
import path from "node:path";

const FALLBACK_CONTEXT_ENGINE_VERSION = "0.1.1";

type OpenClawApiKeyRecord = {
  createdAt: string;
  isActive: boolean;
  lastUsed: string | null;
  lastPluginVersion: string | null;
  lastPluginMode: string | null;
  lastPluginSeenAt: string | null;
};

export type OpenClawPluginStatus = {
  currentVersion: string;
  publishedVersion: string | null;
  lastSeenVersion: string | null;
  lastSeenMode: string | null;
  lastSeenAt: string | null;
  updateAvailable: boolean;
  hasConnectedPlugin: boolean;
};

function normalizeVersion(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const numeric = Number.parseInt(part.replace(/[^0-9].*$/, ""), 10);
      return Number.isFinite(numeric) ? numeric : 0;
    });
}

export function isVersionOutdated(currentVersion: string | null, latestVersion: string): boolean {
  if (!currentVersion) {
    return false;
  }

  const left = normalizeVersion(currentVersion);
  const right = normalizeVersion(latestVersion);
  const width = Math.max(left.length, right.length);
  for (let index = 0; index < width; index += 1) {
    const current = left[index] ?? 0;
    const latest = right[index] ?? 0;
    if (current < latest) {
      return true;
    }
    if (current > latest) {
      return false;
    }
  }
  return false;
}

export async function getCurrentOpenClawPluginVersion(): Promise<string> {
  try {
    const packagePath = path.join(process.cwd(), "packages", "context-engine", "package.json");
    const raw = await readFile(packagePath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // Fall through to fallback version.
  }
  return FALLBACK_CONTEXT_ENGINE_VERSION;
}

export function getPublishedOpenClawPluginVersion(): string | null {
  const configured =
    process.env.OPENCLAW_PUBLISHED_PLUGIN_VERSION ??
    process.env.NEXT_PUBLIC_OPENCLAW_PUBLISHED_PLUGIN_VERSION;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return null;
}

export async function getOpenClawPluginStatus(
  apiKey: OpenClawApiKeyRecord | null,
): Promise<OpenClawPluginStatus> {
  const currentVersion = await getCurrentOpenClawPluginVersion();
  const publishedVersion = getPublishedOpenClawPluginVersion();
  const lastSeenVersion = apiKey?.lastPluginVersion ?? null;
  const lastSeenMode = apiKey?.lastPluginMode ?? null;
  const lastSeenAt = apiKey?.lastPluginSeenAt ?? apiKey?.lastUsed ?? null;

  return {
    currentVersion,
    publishedVersion,
    lastSeenVersion,
    lastSeenMode,
    lastSeenAt,
    updateAvailable: Boolean(publishedVersion) && isVersionOutdated(lastSeenVersion, publishedVersion ?? currentVersion),
    hasConnectedPlugin: Boolean(apiKey?.isActive && lastSeenVersion && lastSeenAt),
  };
}

function parseRecency(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function pickPreferredOpenClawKey<T extends OpenClawApiKeyRecord>(apiKeys: T[]): T | null {
  if (apiKeys.length === 0) {
    return null;
  }

  return apiKeys
    .slice()
    .sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }
      const leftRecency = Math.max(
        parseRecency(left.lastPluginSeenAt),
        parseRecency(left.lastUsed),
        parseRecency(left.createdAt),
      );
      const rightRecency = Math.max(
        parseRecency(right.lastPluginSeenAt),
        parseRecency(right.lastUsed),
        parseRecency(right.createdAt),
      );
      return rightRecency - leftRecency;
    })[0] ?? null;
}
