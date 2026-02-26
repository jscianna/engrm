import crypto from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const USER_KEY_BYTES = 32;
const IV_BYTES = 12;

export function generateUserKey(): Buffer {
  return crypto.randomBytes(USER_KEY_BYTES);
}

export function encryptWithUserKey(plaintext: string, key: Buffer): { ciphertext: string; iv: string } {
  if (key.length !== USER_KEY_BYTES) {
    throw new Error("User key must be 32 bytes for AES-256-GCM.");
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: `${encrypted.toString("base64")}.${authTag.toString("base64")}`,
    iv: iv.toString("base64"),
  };
}

export function decryptWithUserKey(ciphertext: string, iv: string, key: Buffer): string {
  if (key.length !== USER_KEY_BYTES) {
    throw new Error("User key must be 32 bytes for AES-256-GCM.");
  }

  const [encryptedB64, authTagB64] = ciphertext.split(".");
  if (!encryptedB64 || !authTagB64) {
    throw new Error("Encrypted payload format is invalid.");
  }

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function exportKeyForUser(key: Buffer): string {
  if (key.length !== USER_KEY_BYTES) {
    throw new Error("User key must be 32 bytes for AES-256-GCM.");
  }

  return key.toString("base64");
}

export function importKeyFromExport(exported: string): Buffer {
  const decoded = Buffer.from(exported.trim(), "base64");
  if (decoded.length !== USER_KEY_BYTES) {
    throw new Error("Invalid recovery key. Expected a 32-byte base64 value.");
  }
  return decoded;
}
