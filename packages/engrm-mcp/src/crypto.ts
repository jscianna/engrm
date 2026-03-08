/**
 * Client-side encryption for zero-knowledge storage
 * All encryption happens locally - server only sees encrypted blobs
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

export interface EncryptedData {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
  salt: string; // base64
}

/**
 * Derive encryption key from vault password
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt text locally before sending to server
 */
export function encryptLocal(plaintext: string, vaultPassword: string): EncryptedData {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(vaultPassword, salt);
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    salt: salt.toString("base64"),
  };
}

/**
 * Decrypt data received from server
 */
export function decryptLocal(encrypted: EncryptedData, vaultPassword: string): string {
  const salt = Buffer.from(encrypted.salt, "base64");
  const key = deriveKey(vaultPassword, salt);
  const iv = Buffer.from(encrypted.iv, "base64");
  const tag = Buffer.from(encrypted.tag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  
  return decrypted.toString("utf8");
}

/**
 * Check if we have a vault password configured
 */
export function hasVaultPassword(): boolean {
  return !!process.env.FATHIPPO_VAULT_PASSWORD;
}

/**
 * Get vault password from environment
 */
export function getVaultPassword(): string | null {
  return process.env.FATHIPPO_VAULT_PASSWORD || null;
}
