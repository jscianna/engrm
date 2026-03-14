import {
  getNamespaceByName,
  getOrCreateNamespace,
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

export function getRequestedNamespace(
  request: Request,
  explicitNamespaceName: string | null | undefined,
): { name?: string; autoCreateIfMissing: boolean } {
  const explicitName =
    typeof explicitNamespaceName === "string" ? explicitNamespaceName : undefined;
  const headerValue = request.headers.get("x-fathippo-namespace") ?? undefined;
  const runtimeHeader = request.headers.get("x-fathippo-runtime") ?? undefined;
  const namesMatch =
    !explicitName ||
    !headerValue ||
    explicitName.trim() === headerValue.trim();

  return {
    name: explicitName ?? headerValue,
    autoCreateIfMissing:
      Boolean(headerValue?.trim()) && Boolean(runtimeHeader?.trim()) && namesMatch,
  };
}

export async function resolveNamespaceIdOrError(
  userId: string,
  namespaceName: string | undefined,
  options?: { createIfMissing?: boolean },
): Promise<{ namespaceId?: string | null; namespace?: NamespaceRecord | null; error?: Response; created?: boolean }> {
  if (typeof namespaceName === "undefined") {
    return {};
  }

  const cleaned = namespaceName.trim();
  if (!cleaned) {
    return { namespaceId: null };
  }

  const namespace = await getNamespaceByName(userId, cleaned);
  if (!namespace) {
    if (options?.createIfMissing) {
      const created = await getOrCreateNamespace(userId, cleaned);
      return {
        namespaceId: created.id,
        namespace: created,
        created: true,
      };
    }

    return {
      error: jsonError(`Namespace '${cleaned}' not found`, "NAMESPACE_NOT_FOUND", 404),
    };
  }

  return {
    namespaceId: namespace.id,
    namespace,
  };
}
