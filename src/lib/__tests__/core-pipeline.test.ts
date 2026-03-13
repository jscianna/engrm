import crypto from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";

// ── Encryption key tests ─────────────────────────────────────────────────
//
// getMasterKey() is not exported, so we test it indirectly through
// decryptMemoryContent (which calls deriveUserKey → getMasterKey).
// For direct key-format validation, we dynamically import db.ts with
// controlled env vars.

describe("getMasterKey — key format validation", () => {
  const VALID_HEX_KEY = "a".repeat(64);
  const VALID_BASE64_KEY = crypto.randomBytes(32).toString("base64");

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts a valid 64-char hex key", async () => {
    vi.stubEnv("ENCRYPTION_KEY", VALID_HEX_KEY);
    // Stub DB-related env vars so module load doesn't throw elsewhere
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const { decryptMemoryContent } = await import("@/lib/db");
    // If getMasterKey() throws, decryptMemoryContent would never reach
    // the JSON.parse step. A JSON parse error means the key was accepted.
    expect(() => decryptMemoryContent("not-json", "user1")).toThrow(
      "Failed to decrypt memory content."
    );
  });

  it("accepts a valid 32-byte base64 key", async () => {
    vi.stubEnv("ENCRYPTION_KEY", VALID_BASE64_KEY);
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const { decryptMemoryContent } = await import("@/lib/db");
    expect(() => decryptMemoryContent("not-json", "user1")).toThrow(
      "Failed to decrypt memory content."
    );
  });

  it("rejects a weak string key with migration hint in logs", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "password");
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { decryptMemoryContent } = await import("@/lib/db");

    // Error thrown to caller is generic (no key material)
    expect(() => decryptMemoryContent("anything", "user1")).toThrow(
      "Weak keys are no longer accepted"
    );

    // Migration hint stays generic and never logs the effective derived key
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("derive the replacement 64-char hex key offline")
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        crypto.createHash("sha256").update("password", "utf8").digest("hex")
      )
    );
    consoleSpy.mockRestore();
  });

  it("rejects a short hex string (not 64 chars)", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "abcdef1234567890");
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const { decryptMemoryContent } = await import("@/lib/db");
    expect(() => decryptMemoryContent("anything", "user1")).toThrow(
      "Weak keys are no longer accepted"
    );
  });

  it("rejects a non-canonical base64 lookalike", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "passwordpasswordpasswordpasswordpasswordpas");
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const { decryptMemoryContent } = await import("@/lib/db");
    expect(() => decryptMemoryContent("anything", "user1")).toThrow(
      "Weak keys are no longer accepted"
    );
  });

  it("throws when ENCRYPTION_KEY is missing", async () => {
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");
    delete process.env.ENCRYPTION_KEY;

    const { decryptMemoryContent } = await import("@/lib/db");
    expect(() => decryptMemoryContent("anything", "user1")).toThrow(
      "ENCRYPTION_KEY is required"
    );
  });
});

// ── Encryption round-trip tests ──────────────────────────────────────────
//
// Pipeline: plaintext → encryptMemoryContent → decryptMemoryContent → plaintext
//
// encryptMemoryContent is not exported, but we can test the round-trip
// indirectly: insertMemory calls prepareMemoryContentForStorage which
// encrypts. Since insertMemory needs a DB, we test via the exported
// decryptMemoryContent with a manually constructed encrypted payload.

describe("Encryption round-trip", () => {
  const TEST_KEY = "b".repeat(64);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("encrypts and decrypts memory content correctly", async () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const { decryptMemoryContent } = await import("@/lib/db");

    // Manually construct what encryptMemoryContent would produce:
    // deriveUserKey(userId) → SHA-256(masterKey + userId)
    const masterKey = Buffer.from(TEST_KEY, "hex");
    const userKey = crypto
      .createHash("sha256")
      .update(Buffer.concat([masterKey, Buffer.from("test-user", "utf8")]))
      .digest();

    const plaintext = "Remember that the deployment target is us-east-1";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", userKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const encryptedJson = JSON.stringify({
      ciphertext: `${ciphertext.toString("base64")}.${authTag.toString("base64")}`,
      iv: iv.toString("base64"),
    });

    const decrypted = decryptMemoryContent(encryptedJson, "test-user");
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong user ID (per-user key derivation)", async () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const { decryptMemoryContent } = await import("@/lib/db");

    // Encrypt for user-a
    const masterKey = Buffer.from(TEST_KEY, "hex");
    const userAKey = crypto
      .createHash("sha256")
      .update(Buffer.concat([masterKey, Buffer.from("user-a", "utf8")]))
      .digest();

    const plaintext = "secret data for user-a";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", userAKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const encryptedJson = JSON.stringify({
      ciphertext: `${ciphertext.toString("base64")}.${authTag.toString("base64")}`,
      iv: iv.toString("base64"),
    });

    // Attempt decrypt with user-b — should fail (GCM auth tag mismatch)
    expect(() => decryptMemoryContent(encryptedJson, "user-b")).toThrow();
  });

  it("handles unicode content correctly", async () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");

    const { decryptMemoryContent } = await import("@/lib/db");

    const masterKey = Buffer.from(TEST_KEY, "hex");
    const userKey = crypto
      .createHash("sha256")
      .update(Buffer.concat([masterKey, Buffer.from("user-unicode", "utf8")]))
      .digest();

    const plaintext = "日本語テスト 🦛 émojis and spëcîal chars";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", userKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const encryptedJson = JSON.stringify({
      ciphertext: `${ciphertext.toString("base64")}.${authTag.toString("base64")}`,
      iv: iv.toString("base64"),
    });

    expect(decryptMemoryContent(encryptedJson, "user-unicode")).toBe(plaintext);
  });
});

// ── Secret detection tests ───────────────────────────────────────────────

describe("Secret detection", () => {
  it("detects OpenAI API keys", async () => {
    const { containsSecrets } = await import("@/lib/secrets");
    expect(containsSecrets("my key is sk-abcdefghijklmnopqrstuvwxyz")).toBe(true);
  });

  it("detects GitHub tokens", async () => {
    const { containsSecrets } = await import("@/lib/secrets");
    expect(containsSecrets("token: ghp_" + "a".repeat(36))).toBe(true);
  });

  it("does not flag normal text as secrets", async () => {
    const { containsSecrets } = await import("@/lib/secrets");
    expect(containsSecrets("Remember to deploy to production on Friday")).toBe(false);
  });

  it("redacts secrets while preserving partial visibility", async () => {
    const { redactSecrets } = await import("@/lib/secrets");
    const input = "Use this key: sk-abcdefghijklmnopqrstuvwxyz";
    const redacted = redactSecrets(input);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    // Partial visibility: some prefix chars should remain
    expect(redacted).toContain("sk-");
  });

  it("detects Stripe secret keys", async () => {
    const { containsSecrets } = await import("@/lib/secrets");
    expect(containsSecrets("sk_live_" + "a".repeat(24))).toBe(true);
    expect(containsSecrets("sk_test_" + "b".repeat(24))).toBe(true);
  });

  it("detects AWS access keys", async () => {
    const { containsSecrets } = await import("@/lib/secrets");
    expect(containsSecrets("AKIAIOSFODNN7EXAMPLE")).toBe(true);
  });

  it("detects vault query intent", async () => {
    const { detectSecretQueryIntent } = await import("@/lib/secrets");

    const result = detectSecretQueryIntent("what is my API key?");
    expect(result.isSecretQuery).toBe(true);

    const normalQuery = detectSecretQueryIntent("what time is the meeting?");
    expect(normalQuery.isSecretQuery).toBe(false);
  });
});

// ── LLM provider tests ──────────────────────────────────────────────────

describe("LLM provider configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws LLM_UNAVAILABLE when no provider keys are set", async () => {
    // Clear all LLM-related env vars
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const { callLLM, LLMError } = await import("@/lib/llm");

    await expect(callLLM("test prompt")).rejects.toThrow("No LLM provider configured");
    await expect(callLLM("test prompt")).rejects.toBeInstanceOf(LLMError);
  });
});
