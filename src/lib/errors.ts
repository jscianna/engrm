/**
 * Consistent error handling for FatHippo API
 * All errors have codes, HTTP status, and user-friendly messages
 */

export type ErrorCode =
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "AUTH_INVALID_KEY"
  | "RATE_LIMIT_MINUTE"
  | "RATE_LIMIT_DAILY"
  | "QUOTA_MEMORIES"
  | "QUOTA_STORAGE"
  | "MEMORY_NOT_FOUND"
  | "CHATBOT_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "CONVERSATION_NOT_FOUND"
  | "NAMESPACE_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "SYNTHESIS_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "ENCRYPTION_REQUIRED"
  | "ENCRYPTION_ERROR"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

const ERROR_DETAILS: Record<ErrorCode, { status: number; message: string; userMessage: string }> = {
  AUTH_MISSING: {
    status: 401,
    message: "Missing Authorization header",
    userMessage: "API key required. Add 'Authorization: Bearer <your-key>' header.",
  },
  AUTH_INVALID: {
    status: 401,
    message: "Invalid Authorization header format",
    userMessage: "Use 'Authorization: Bearer <your-key>' format.",
  },
  AUTH_INVALID_KEY: {
    status: 401,
    message: "Invalid API key",
    userMessage: "API key not found or revoked. Generate a new key in Settings.",
  },
  RATE_LIMIT_MINUTE: {
    status: 429,
    message: "Rate limit exceeded (per-minute)",
    userMessage: "Too many requests. Wait a moment and try again.",
  },
  RATE_LIMIT_DAILY: {
    status: 429,
    message: "Daily rate limit exceeded",
    userMessage: "Daily API limit reached. Limits reset at midnight UTC.",
  },
  QUOTA_MEMORIES: {
    status: 403,
    message: "Memory quota exceeded",
    userMessage: "Memory limit reached. Delete old memories or upgrade your plan.",
  },
  QUOTA_STORAGE: {
    status: 403,
    message: "Storage quota exceeded",
    userMessage: "Storage limit reached. Delete old memories or upgrade your plan.",
  },
  MEMORY_NOT_FOUND: {
    status: 404,
    message: "Memory not found",
    userMessage: "This memory doesn't exist or you don't have access.",
  },
  CHATBOT_NOT_FOUND: {
    status: 404,
    message: "Chatbot not found",
    userMessage: "This chatbot doesn't exist or you don't have access.",
  },
  SOURCE_NOT_FOUND: {
    status: 404,
    message: "Source not found",
    userMessage: "This source doesn't exist or you don't have access.",
  },
  CONVERSATION_NOT_FOUND: {
    status: 404,
    message: "Conversation not found",
    userMessage: "This conversation doesn't exist or you don't have access.",
  },
  NAMESPACE_NOT_FOUND: {
    status: 404,
    message: "Namespace not found",
    userMessage: "This namespace doesn't exist. Create it first.",
  },
  SESSION_NOT_FOUND: {
    status: 404,
    message: "Session not found",
    userMessage: "This session doesn't exist. Create it first.",
  },
  SYNTHESIS_NOT_FOUND: {
    status: 404,
    message: "Synthesis not found",
    userMessage: "This synthesis doesn't exist or you don't have access.",
  },
  VALIDATION_ERROR: {
    status: 400,
    message: "Validation error",
    userMessage: "Invalid request. Check your input and try again.",
  },
  ENCRYPTION_REQUIRED: {
    status: 400,
    message: "Encryption required",
    userMessage: "Provide encrypted content and iv fields when sending encrypted memories.",
  },
  ENCRYPTION_ERROR: {
    status: 500,
    message: "Encryption failed",
    userMessage: "Failed to encrypt or decrypt stored content.",
  },
  DATABASE_ERROR: {
    status: 500,
    message: "Database error",
    userMessage: "Something went wrong. Please try again.",
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "Internal server error",
    userMessage: "Something went wrong. Please try again.",
  },
};

export class MemryError extends Error {
  code: ErrorCode;
  status: number;
  userMessage: string;
  details?: Record<string, unknown>;

  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    const info = ERROR_DETAILS[code];
    super(info.message);
    this.code = code;
    this.status = info.status;
    this.userMessage = info.userMessage;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.userMessage,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * @deprecated Use MemryError instead
 * Backward compatibility alias for existing API routes
 */
export class ApiAuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof MemryError) {
    return Response.json(error.toJSON(), { status: error.status });
  }

  // Log unexpected errors
  console.error("[FatHippo] Unexpected error:", error);

  const fallback = new MemryError("INTERNAL_ERROR");
  return Response.json(fallback.toJSON(), { status: fallback.status });
}

/**
 * Wrap an API handler with consistent error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>
): Promise<T | Response> {
  return handler().catch((error) => errorResponse(error));
}
