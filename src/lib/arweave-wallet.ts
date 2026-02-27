/**
 * Generate and manage Arweave wallets client-side.
 * Wallet is encrypted with user's vault key before storage.
 */

import type { ArweaveJWK } from "@ardrive/turbo-sdk";

// Generate a new Arweave RSA-4096 wallet
export async function generateArweaveWallet(): Promise<ArweaveJWK> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-PSS",
      modulusLength: 4096,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
      hash: "SHA-256",
    },
    true, // extractable
    ["sign", "verify"]
  );

  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // Convert to Arweave JWK format (subset of standard JWK)
  return {
    kty: privateJwk.kty as "RSA",
    n: privateJwk.n!,
    e: privateJwk.e!,
    d: privateJwk.d!,
    p: privateJwk.p!,
    q: privateJwk.q!,
    dp: privateJwk.dp!,
    dq: privateJwk.dq!,
    qi: privateJwk.qi!,
  };
}

// Get wallet address from JWK (SHA-256 hash of n, base64url encoded)
export async function getWalletAddress(jwk: ArweaveJWK): Promise<string> {
  const nBytes = base64UrlToBytes(jwk.n);
  const hashBuffer = await crypto.subtle.digest("SHA-256", nBytes.buffer as ArrayBuffer);
  return bytesToBase64Url(new Uint8Array(hashBuffer));
}

function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
