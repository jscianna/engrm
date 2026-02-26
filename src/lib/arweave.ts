import Arweave from "arweave";
import type { ArweaveJWK } from "@ardrive/turbo-sdk";
import { getUserArweaveJwk } from "@/lib/db";
import { getArweaveKeyFromEnv, parseArweaveJwk, turboToken } from "@/lib/turbo";
import type { ArweaveWalletStatus } from "@/lib/types";
import { fetchArweaveData } from "@/lib/wayfinder";

const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export async function resolveUserArweaveKey(userId: string): Promise<{ key: ArweaveJWK | null; source: "user" | "env" | "none" }> {
  const userRaw = await getUserArweaveJwk(userId);
  if (userRaw) {
    return { key: parseArweaveJwk(userRaw), source: "user" };
  }

  const envKey = getArweaveKeyFromEnv();
  if (envKey) {
    return { key: envKey, source: "env" };
  }

  return { key: null, source: "none" };
}

export async function getArweaveWalletStatus(userId: string): Promise<ArweaveWalletStatus> {
  const resolved = await resolveUserArweaveKey(userId);
  if (!resolved.key) {
    return {
      source: "none",
      hasWallet: false,
      address: null,
      balanceAr: null,
      token: turboToken,
    };
  }

  const address = await arweave.wallets.jwkToAddress(resolved.key);
  const winston = await arweave.wallets.getBalance(address);
  const balanceAr = arweave.ar.winstonToAr(winston);

  return {
    source: resolved.source,
    hasWallet: true,
    address,
    balanceAr,
    token: turboToken,
  };
}

export type ArweaveMemoryData = {
  txId: string;
  title: string | null;
  content: string;
  tags: string[];
  sourceType: string | null;
  memoryType: string | null;
  importance: number | null;
  verified: boolean;
  raw: string;
};

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export async function getMemoryFromArweave(txId: string): Promise<ArweaveMemoryData | null> {
  const fetched = await fetchArweaveData(txId);
  if (!fetched) {
    return null;
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    const candidate = JSON.parse(fetched.data) as unknown;
    if (candidate && typeof candidate === "object") {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    parsed = null;
  }

  const content =
    toStringOrNull(parsed?.content) ??
    toStringOrNull(parsed?.contentText) ??
    toStringOrNull(parsed?.text) ??
    fetched.data;

  return {
    txId,
    title: toStringOrNull(parsed?.title),
    content,
    tags: toTags(parsed?.tags),
    sourceType: toStringOrNull(parsed?.sourceType),
    memoryType: toStringOrNull(parsed?.memoryType),
    importance: toNumberOrNull(parsed?.importance),
    verified: fetched.verified,
    raw: fetched.data,
  };
}
