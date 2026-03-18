import {
  recordApiKeyPluginMetadata,
  recordApiKeyRuntime,
  validateApiKey as validateApiKeyInDb,
} from "@/lib/db";
import { FatHippoError, ApiAuthError, errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limiter";
import { assertEntitlement, featureForEndpoint } from "@/lib/entitlements";

// Re-export for backward compatibility
export { ApiAuthError };

export type ApiKeyIdentity = {
  userId: string;
  agentId: string;
  keyId: string;
  scopes: string[];
};

function apiKeyAllowsScope(scopes: string[], requiredScope: string): boolean {
  if (scopes.includes("*")) {
    return true;
  }
  for (const scope of scopes) {
    if (scope === requiredScope) {
      return true;
    }
    if (scope.endsWith(".*")) {
      const prefix = scope.slice(0, -2);
      if (requiredScope === prefix || requiredScope.startsWith(`${prefix}.`)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validate API key and check rate limits
 * Returns identity if valid, throws FatHippoError if not
 */
export async function validateApiKey(
  request: Request,
  endpoint: string = "unknown"
): Promise<ApiKeyIdentity> {
  const header = request.headers.get("authorization");
  if (!header) {
    throw new FatHippoError("AUTH_MISSING");
  }

  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new FatHippoError("AUTH_INVALID");
  }

  const identity = await validateApiKeyInDb(token);
  if (!identity) {
    throw new FatHippoError("AUTH_INVALID_KEY");
  }

  if (!apiKeyAllowsScope(identity.scopes, endpoint)) {
    throw new FatHippoError("AUTH_FORBIDDEN", {
      requiredScope: endpoint,
    });
  }

  const feature = featureForEndpoint(endpoint);
  if (feature) {
    await assertEntitlement(identity.userId, feature);
  }

  // Check rate limits and record the API call
  // Pass raw token for elevated limit checks (testing/enterprise keys)
  // Pass key prefix hash for elevated checks, never the raw token
  const key_prefix_hash = identity.keyId;
  await checkRateLimit(identity.userId, key_prefix_hash, endpoint);

  const pluginId = request.headers.get("x-fathippo-plugin-id");
  const pluginVersion = request.headers.get("x-fathippo-plugin-version");
  const pluginMode = request.headers.get("x-fathippo-plugin-mode");
  if (pluginId || pluginVersion || pluginMode) {
    try {
      await recordApiKeyPluginMetadata({
        keyId: identity.keyId,
        userId: identity.userId,
        pluginId,
        pluginVersion,
        pluginMode,
      });
    } catch (error) {
      console.warn("[API Auth] Failed to persist plugin metadata:", error);
    }
  }

  // Track which runtime platform is calling (codex, claude, cursor, etc.)
  const runtime_header = request.headers.get("x-fathippo-runtime");
  if (runtime_header) {
    recordApiKeyRuntime(identity.keyId, runtime_header).catch(() => {});
  }

  return identity;
}

/**
 * Wrapper for API routes that need auth + rate limiting
 */
export function withApiAuth(
  handler: (request: Request, identity: ApiKeyIdentity) => Promise<Response>,
  endpoint: string
) {
  return async (request: Request): Promise<Response> => {
    try {
      const identity = await validateApiKey(request, endpoint);
      return await handler(request, identity);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * Validate API key against multiple acceptable scopes.
 * Returns identity as soon as one scope matches.
 */
export async function validateApiKeyAnyScope(
  request: Request,
  endpoints: string[],
): Promise<ApiKeyIdentity> {
  if (endpoints.length === 0) {
    throw new FatHippoError("VALIDATION_ERROR", { reason: "No scopes provided" });
  }

  // Find the first matching scope without triggering side effects,
  // then call validateApiKey once with that scope.
  const header = request.headers.get("authorization");
  if (!header) {
    throw new FatHippoError("AUTH_MISSING");
  }

  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new FatHippoError("AUTH_INVALID");
  }

  const identity = await validateApiKeyInDb(token);
  if (!identity) {
    throw new FatHippoError("AUTH_INVALID_KEY");
  }

  // Check which scope matches (no side effects)
  const matched_endpoint = endpoints.find((ep) => apiKeyAllowsScope(identity.scopes, ep));
  if (!matched_endpoint) {
    throw new FatHippoError("AUTH_FORBIDDEN", { requiredScope: endpoints.join(" | ") });
  }

  // Now call full validateApiKey once with the matched scope (triggers rate limit + tracking)
  return validateApiKey(request, matched_endpoint);
}
