/**
 * Collective Intelligence — API Client
 *
 * Fire-and-forget HTTP client for collective pattern sharing.
 * Never blocks the session. All calls are best-effort.
 */
import type { CollectivePattern, SharedSignal } from "./types.js";
/**
 * Submit a shared signal to the collective API.
 * Fire-and-forget: never throws, never blocks.
 */
export declare function submitSharedSignal(signal: SharedSignal, apiKey: string, baseUrl: string): Promise<void>;
/**
 * Fetch collective patterns matching an error.
 * Returns empty array on failure — never blocks the session.
 */
export declare function fetchCollectivePatterns(errorType: string, framework: string, apiKey: string, baseUrl: string): Promise<CollectivePattern[]>;
//# sourceMappingURL=client.d.ts.map