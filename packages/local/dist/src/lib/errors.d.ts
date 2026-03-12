/**
 * Consistent error handling for FatHippo API
 * All errors have codes, HTTP status, and user-friendly messages
 */
export type ErrorCode = "AUTH_MISSING" | "AUTH_INVALID" | "AUTH_INVALID_KEY" | "AUTH_FORBIDDEN" | "RATE_LIMIT_MINUTE" | "RATE_LIMIT_DAILY" | "RATE_LIMIT_ACTION" | "QUOTA_MEMORIES" | "QUOTA_STORAGE" | "MEMORY_NOT_FOUND" | "CHATBOT_NOT_FOUND" | "SOURCE_NOT_FOUND" | "CONVERSATION_NOT_FOUND" | "NAMESPACE_NOT_FOUND" | "SESSION_NOT_FOUND" | "SYNTHESIS_NOT_FOUND" | "VALIDATION_ERROR" | "ENCRYPTION_REQUIRED" | "ENCRYPTION_ERROR" | "DATABASE_ERROR" | "INTERNAL_ERROR";
export declare class MemryError extends Error {
    code: ErrorCode;
    status: number;
    userMessage: string;
    details?: Record<string, unknown>;
    constructor(code: ErrorCode, details?: Record<string, unknown>);
    toJSON(): {
        error: {
            details?: Record<string, unknown> | undefined;
            code: ErrorCode;
            message: string;
        };
    };
}
/**
 * @deprecated Use MemryError instead
 * Backward compatibility alias for existing API routes
 */
export declare class ApiAuthError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string);
}
export declare function errorResponse(error: unknown): Response;
/**
 * Wrap an API handler with consistent error handling
 */
export declare function withErrorHandling<T>(handler: () => Promise<T>): Promise<T | Response>;
//# sourceMappingURL=errors.d.ts.map