import crypto from "node:crypto";
import { createApiKey, ensureCoreMemoryTables, getOrCreateNamespace } from "@/lib/db";
import { getDb } from "@/lib/turso";

const OPENCLAW_CONNECT_TTL_MS = 15 * 60 * 1000;
const OPENCLAW_CONNECT_POLL_INTERVAL_MS = 2000;
const OPENCLAW_CONNECT_STATUS_PENDING = "pending";
const OPENCLAW_CONNECT_STATUS_CLAIMED = "claimed";
const OPENCLAW_CONNECT_STATUS_CONSUMED = "consumed";
const OPENCLAW_CONNECT_STATUS_EXPIRED = "expired";

export const OPENCLAW_CONNECT_API_KEY_SCOPES = [
  "sessions.start",
  "sessions.turn",
  "sessions.end",
  "simple.context",
  "indexed.list",
  "lifecycle.maintenance",
  "cognitive.constraints.list",
  "cognitive.patterns.extract",
  "cognitive.skills.synthesize",
  "cognitive.traces.relevant",
] as const;

type OpenClawConnectRow = {
  id: string;
  pollTokenHash: string;
  userCode: string;
  status: string;
  mode: string;
  namespaceHint: string | null;
  claimedNamespace: string | null;
  installationName: string | null;
  installationId: string;
  cliVersion: string | null;
  platform: string | null;
  arch: string | null;
  userId: string | null;
  payloadEncrypted: string | null;
  createdAt: string;
  claimedAt: string | null;
  consumedAt: string | null;
  expiresAt: string;
};

export type OpenClawConnectStartInput = {
  arch?: string | null;
  cliVersion?: string | null;
  installationName?: string | null;
  mode?: string | null;
  namespaceHint?: string | null;
  platform?: string | null;
};

export type OpenClawConnectStartResult = {
  connectId: string;
  expiresAt: string;
  installationId: string;
  pollIntervalMs: number;
  pollToken: string;
  userCode: string;
};

export type OpenClawConnectPublicSession = {
  connectId: string;
  expiresAt: string;
  installationId: string;
  installationName: string | null;
  namespaceHint: string | null;
  status: "pending" | "claimed" | "consumed" | "expired";
  userCode: string;
};

export type OpenClawConnectClaimResult = {
  expiresAt: string;
  installationId: string;
  namespace: string | null;
  status: "claimed" | "consumed";
  userCode: string;
};

export type OpenClawConnectPollResult =
  | {
      expiresAt: string;
      status: "pending";
    }
  | {
      apiKey: string;
      baseUrl: string;
      installationId: string;
      namespace: string | null;
      status: "authorized";
    }
  | {
      error: string;
      status: "consumed" | "expired";
    };

class ConnectSessionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let connectTableReady = false;
let connectTablePromise: Promise<void> | null = null;

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function createUserCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

function parseCanonicalBase64Key(input: string): Buffer | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) {
    return null;
  }

  const decoded = Buffer.from(input, "base64");
  if (decoded.length !== 32) {
    return null;
  }

  return decoded.toString("base64") === input ? decoded : null;
}

function getConnectKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new ConnectSessionError("ENCRYPTION_KEY is required for OpenClaw connect sessions.", 500);
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const base64Key = parseCanonicalBase64Key(raw);
  if (base64Key) {
    return base64Key;
  }

  throw new ConnectSessionError("ENCRYPTION_KEY must be a 64-char hex or 32-byte base64 key.", 500);
}

function encryptPayload(payload: string): string {
  const key = getConnectKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
  });
}

function decryptPayload(payload: string): string {
  const parsed = JSON.parse(payload) as {
    ciphertext?: string;
    iv?: string;
    tag?: string;
  };
  if (!parsed.ciphertext || !parsed.iv || !parsed.tag) {
    throw new ConnectSessionError("Connect payload is malformed.", 500);
  }

  const key = getConnectKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function ensureOpenClawConnectTable(): Promise<void> {
  if (connectTableReady) {
    return;
  }
  if (connectTablePromise) {
    await connectTablePromise;
    return;
  }

  connectTablePromise = (async () => {
    await ensureCoreMemoryTables();
    const client = getDb();
    await client.execute(`
      CREATE TABLE IF NOT EXISTS openclaw_connect_sessions (
        id TEXT PRIMARY KEY,
        poll_token_hash TEXT NOT NULL UNIQUE,
        user_code TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'hosted',
        namespace_hint TEXT,
        claimed_namespace TEXT,
        installation_name TEXT,
        installation_id TEXT NOT NULL,
        cli_version TEXT,
        platform TEXT,
        arch TEXT,
        user_id TEXT,
        payload_encrypted TEXT,
        created_at TEXT NOT NULL,
        claimed_at TEXT,
        consumed_at TEXT,
        expires_at TEXT NOT NULL
      )
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_openclaw_connect_status_expires
      ON openclaw_connect_sessions(status, expires_at)
    `);
    connectTableReady = true;
  })();

  try {
    await connectTablePromise;
  } finally {
    connectTablePromise = null;
  }
}

function mapRow(row: Record<string, unknown>): OpenClawConnectRow {
  return {
    id: String(row.id),
    pollTokenHash: String(row.poll_token_hash),
    userCode: String(row.user_code),
    status: String(row.status),
    mode: String(row.mode),
    namespaceHint: normalizeOptionalString(row.namespace_hint, 120),
    claimedNamespace: normalizeOptionalString(row.claimed_namespace, 120),
    installationName: normalizeOptionalString(row.installation_name, 120),
    installationId: String(row.installation_id),
    cliVersion: normalizeOptionalString(row.cli_version, 32),
    platform: normalizeOptionalString(row.platform, 32),
    arch: normalizeOptionalString(row.arch, 32),
    userId: normalizeOptionalString(row.user_id, 128),
    payloadEncrypted: stringOrNull(row.payload_encrypted),
    createdAt: String(row.created_at),
    claimedAt: normalizeOptionalString(row.claimed_at, 64),
    consumedAt: normalizeOptionalString(row.consumed_at, 64),
    expiresAt: String(row.expires_at),
  };
}

function isExpired(row: Pick<OpenClawConnectRow, "expiresAt">): boolean {
  return Date.parse(row.expiresAt) <= Date.now();
}

async function getSession(connectId: string): Promise<OpenClawConnectRow | null> {
  await ensureOpenClawConnectTable();
  const client = getDb();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM openclaw_connect_sessions
      WHERE id = ?
      LIMIT 1
    `,
    args: [connectId],
  });

  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

async function markExpired(connectId: string): Promise<void> {
  const client = getDb();
  await client.execute({
    sql: `
      UPDATE openclaw_connect_sessions
      SET status = ?
      WHERE id = ? AND status = ?
    `,
    args: [OPENCLAW_CONNECT_STATUS_EXPIRED, connectId, OPENCLAW_CONNECT_STATUS_PENDING],
  });
}

function toPublicSession(row: OpenClawConnectRow): OpenClawConnectPublicSession {
  return {
    connectId: row.id,
    expiresAt: row.expiresAt,
    installationId: row.installationId,
    installationName: row.installationName,
    namespaceHint: row.claimedNamespace ?? row.namespaceHint,
    status:
      row.status === OPENCLAW_CONNECT_STATUS_CLAIMED
        ? "claimed"
        : row.status === OPENCLAW_CONNECT_STATUS_CONSUMED
          ? "consumed"
          : row.status === OPENCLAW_CONNECT_STATUS_EXPIRED || isExpired(row)
            ? "expired"
            : "pending",
    userCode: row.userCode,
  };
}

export async function startOpenClawConnectSession(
  input: OpenClawConnectStartInput,
): Promise<OpenClawConnectStartResult> {
  await ensureOpenClawConnectTable();

  const connectId = `conn_${crypto.randomUUID().replaceAll("-", "")}`;
  const pollToken = `poll_${crypto.randomBytes(24).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OPENCLAW_CONNECT_TTL_MS).toISOString();
  const userCode = createUserCode();
  const installationId = `oc_${crypto.randomUUID().replaceAll("-", "")}`;
  const client = getDb();

  await client.execute({
    sql: `
      INSERT INTO openclaw_connect_sessions (
        id,
        poll_token_hash,
        user_code,
        status,
        mode,
        namespace_hint,
        installation_name,
        installation_id,
        cli_version,
        platform,
        arch,
        created_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      connectId,
      hashToken(pollToken),
      userCode,
      OPENCLAW_CONNECT_STATUS_PENDING,
      normalizeOptionalString(input.mode, 24) ?? "hosted",
      normalizeOptionalString(input.namespaceHint, 120),
      normalizeOptionalString(input.installationName, 120),
      installationId,
      normalizeOptionalString(input.cliVersion, 32),
      normalizeOptionalString(input.platform, 32),
      normalizeOptionalString(input.arch, 32),
      now.toISOString(),
      expiresAt,
    ],
  });

  return {
    connectId,
    expiresAt,
    installationId,
    pollIntervalMs: OPENCLAW_CONNECT_POLL_INTERVAL_MS,
    pollToken,
    userCode,
  };
}

export async function getOpenClawConnectSessionPublic(
  connectId: string,
): Promise<OpenClawConnectPublicSession | null> {
  const session = await getSession(connectId);
  if (!session) {
    return null;
  }
  if (isExpired(session) && session.status === OPENCLAW_CONNECT_STATUS_PENDING) {
    await markExpired(connectId);
    return {
      ...toPublicSession(session),
      status: "expired",
    };
  }
  return toPublicSession(session);
}

export async function claimOpenClawConnectSession(params: {
  baseUrl: string;
  connectId: string;
  namespace?: string | null;
  userId: string;
}): Promise<OpenClawConnectClaimResult> {
  const session = await getSession(params.connectId);
  if (!session) {
    throw new ConnectSessionError("Connect session not found.", 404);
  }
  if (isExpired(session)) {
    await markExpired(session.id);
    throw new ConnectSessionError("This connect session has expired. Start a fresh install.", 410);
  }
  if (session.userId && session.userId !== params.userId) {
    throw new ConnectSessionError("This connect session is already claimed by another account.", 409);
  }
  if (session.status === OPENCLAW_CONNECT_STATUS_CONSUMED) {
    return {
      expiresAt: session.expiresAt,
      installationId: session.installationId,
      namespace: session.claimedNamespace ?? session.namespaceHint,
      status: "consumed",
      userCode: session.userCode,
    };
  }
  if (session.status === OPENCLAW_CONNECT_STATUS_CLAIMED) {
    return {
      expiresAt: session.expiresAt,
      installationId: session.installationId,
      namespace: session.claimedNamespace ?? session.namespaceHint,
      status: "claimed",
      userCode: session.userCode,
    };
  }

  const namespace =
    normalizeOptionalString(params.namespace, 120) ??
    session.namespaceHint;
  if (namespace) {
    await getOrCreateNamespace(params.userId, namespace);
  }

  const { apiKey } = await createApiKey(
    params.userId,
    "openclaw",
    [...OPENCLAW_CONNECT_API_KEY_SCOPES],
  );
  const payloadEncrypted = encryptPayload(
    JSON.stringify({
      apiKey,
      baseUrl: params.baseUrl,
      installationId: session.installationId,
      namespace: namespace ?? null,
    }),
  );
  const client = getDb();
  const claimedAt = new Date().toISOString();

  await client.execute({
    sql: `
      UPDATE openclaw_connect_sessions
      SET status = ?, user_id = ?, claimed_namespace = ?, payload_encrypted = ?, claimed_at = ?
      WHERE id = ?
    `,
    args: [
      OPENCLAW_CONNECT_STATUS_CLAIMED,
      params.userId,
      namespace ?? null,
      payloadEncrypted,
      claimedAt,
      session.id,
    ],
  });

  return {
    expiresAt: session.expiresAt,
    installationId: session.installationId,
    namespace: namespace ?? null,
    status: "claimed",
    userCode: session.userCode,
  };
}

export async function pollOpenClawConnectSession(params: {
  connectId: string;
  pollToken: string;
}): Promise<OpenClawConnectPollResult> {
  const session = await getSession(params.connectId);
  if (!session) {
    throw new ConnectSessionError("Connect session not found.", 404);
  }
  if (session.pollTokenHash !== hashToken(params.pollToken)) {
    throw new ConnectSessionError("Invalid poll token.", 401);
  }
  if (isExpired(session)) {
    await markExpired(session.id);
    return {
      error: "This connect session expired before it was authorized.",
      status: "expired",
    };
  }
  if (session.status === OPENCLAW_CONNECT_STATUS_PENDING) {
    return {
      expiresAt: session.expiresAt,
      status: "pending",
    };
  }
  if (session.status === OPENCLAW_CONNECT_STATUS_CONSUMED) {
    return {
      error: "This connect session was already delivered to the CLI.",
      status: "consumed",
    };
  }
  if (session.status !== OPENCLAW_CONNECT_STATUS_CLAIMED || !session.payloadEncrypted) {
    throw new ConnectSessionError("Connect session is in an invalid state.", 409);
  }

  const payload = JSON.parse(decryptPayload(session.payloadEncrypted)) as {
    apiKey?: string;
    baseUrl?: string;
    installationId?: string;
    namespace?: string | null;
  };
  if (!payload.apiKey || !payload.baseUrl || !payload.installationId) {
    throw new ConnectSessionError("Connect payload is incomplete.", 500);
  }

  const client = getDb();
  await client.execute({
    sql: `
      UPDATE openclaw_connect_sessions
      SET status = ?, consumed_at = ?, payload_encrypted = NULL
      WHERE id = ?
    `,
    args: [OPENCLAW_CONNECT_STATUS_CONSUMED, new Date().toISOString(), session.id],
  });

  return {
    apiKey: payload.apiKey,
    baseUrl: payload.baseUrl,
    installationId: payload.installationId,
    namespace: typeof payload.namespace === "string" ? payload.namespace : null,
    status: "authorized",
  };
}

export function isConnectSessionError(error: unknown): error is ConnectSessionError {
  return error instanceof ConnectSessionError;
}
