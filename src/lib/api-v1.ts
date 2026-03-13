import {
  getNamespaceByName,
  type NamespaceRecord,
} from "@/lib/db";
import { FatHippoError } from "@/lib/errors";

export function jsonError(error: string, code: string, status: number): Response {
  return Response.json({ error, code }, { status });
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeLimit(raw: unknown, fallback: number, max = 200): number {
  const parsed = typeof raw === "string" ? Number(raw) : Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

export function normalizeIsoTimestamp(raw: unknown, field: string): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new FatHippoError("VALIDATION_ERROR", { field, reason: "invalid timestamp" });
  }

  return new Date(parsed).toISOString();
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function resolveNamespaceIdOrError(
  userId: string,
  namespaceName: string | undefined,
): Promise<{ namespaceId?: string | null; namespace?: NamespaceRecord | null; error?: Response }> {
  if (typeof namespaceName === "undefined") {
    return {};
  }

  const cleaned = namespaceName.trim();
  if (!cleaned) {
    return { namespaceId: null };
  }

  const namespace = await getNamespaceByName(userId, cleaned);
  if (!namespace) {
    return {
      error: jsonError(`Namespace '${cleaned}' not found`, "NAMESPACE_NOT_FOUND", 404),
    };
  }

  return {
    namespaceId: namespace.id,
    namespace,
  };
}
