import { validateApiKey as validateApiKeyInDb } from "@/lib/db";
import { MemryError, ApiAuthError, errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limiter";

// Re-export for backward compatibility
export { ApiAuthError };

export type ApiKeyIdentity = {
  userId: string;
  agentId: string;
  keyId: string;
};

/**
 * Validate API key and check rate limits
 * Returns identity if valid, throws MemryError if not
 */
export async function validateApiKey(
  request: Request,
  endpoint: string = "unknown"
): Promise<ApiKeyIdentity> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    throw new MemryError("AUTH_MISSING");
  }

  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new MemryError("AUTH_INVALID");
  }

  const identity = await validateApiKeyInDb(token);
  if (!identity) {
    throw new MemryError("AUTH_INVALID_KEY");
  }

  // Check rate limits and record the API call
  await checkRateLimit(identity.userId, identity.keyId, endpoint);

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
