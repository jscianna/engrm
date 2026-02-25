import Arweave from "arweave";
import type { ArweaveJWK } from "@ardrive/turbo-sdk";
import { getUserArweaveJwk } from "@/lib/db";
import { getArweaveKeyFromEnv, parseArweaveJwk, turboToken } from "@/lib/turbo";
import type { ArweaveWalletStatus } from "@/lib/types";

const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export function resolveUserArweaveKey(userId: string): { key: ArweaveJWK | null; source: "user" | "env" | "none" } {
  const userRaw = getUserArweaveJwk(userId);
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
  const resolved = resolveUserArweaveKey(userId);
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
