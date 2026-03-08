import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const API_KEY_PATTERN = /^mem_[a-f0-9]{24,}$/i;

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) {
    return null;
  }

  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function isApiKeyAuthenticatedRequest(request: Request): boolean {
  const bearerToken = extractBearerToken(request);
  const xApiKey = request.headers.get("x-api-key")?.trim() ?? null;

  return Boolean(
    (bearerToken && API_KEY_PATTERN.test(bearerToken)) ||
      (xApiKey && API_KEY_PATTERN.test(xApiKey)),
  );
}

export async function requireVaultSessionAuth(request: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  if (isApiKeyAuthenticatedRequest(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Vault endpoints require web session authentication. API keys are not allowed." },
        { status: 403 },
      ),
    };
  }

  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, userId };
}
