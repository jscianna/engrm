import { validateApiKey as validateApiKeyInDb } from "@/lib/db";

export class ApiAuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function validateApiKey(request: Request): Promise<{ userId: string; agentId: string }> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    throw new ApiAuthError("Missing Authorization header", 401, "AUTH_MISSING");
  }

  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ApiAuthError("Invalid Authorization header", 401, "AUTH_INVALID");
  }

  // TODO: Add per-key rate limiting.
  const identity = await validateApiKeyInDb(token);
  if (!identity) {
    throw new ApiAuthError("Invalid API key", 401, "AUTH_INVALID_KEY");
  }

  return identity;
}
