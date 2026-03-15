/**
 * Collective Intelligence — API Client
 *
 * Fire-and-forget HTTP client for collective pattern sharing.
 * Never blocks the session. All calls are best-effort.
 */
import { computePatternHash } from "./matcher.js";
/**
 * Submit a shared signal to the collective API.
 * Fire-and-forget: never throws, never blocks.
 */
export async function submitSharedSignal(signal, apiKey, baseUrl) {
    try {
        const hash = computePatternHash(signal);
        const response = await fetch(`${baseUrl}/v1/collective/submit`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...signal,
                patternHash: hash,
            }),
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            // Best effort — log but don't throw
            console.error(`[FatHippo Collective] Submit failed: ${response.status}`);
        }
    }
    catch (error) {
        // Fire and forget — never block the session
        console.error("[FatHippo Collective] Submit error:", error instanceof Error ? error.message : "unknown");
    }
}
/**
 * Fetch collective patterns matching an error.
 * Returns empty array on failure — never blocks the session.
 */
export async function fetchCollectivePatterns(errorType, framework, apiKey, baseUrl) {
    try {
        const params = new URLSearchParams();
        params.set("errorType", errorType);
        if (framework) {
            params.set("framework", framework);
        }
        const response = await fetch(`${baseUrl}/v1/collective/query?${params.toString()}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            return [];
        }
        const data = await response.json();
        return data.patterns ?? [];
    }
    catch {
        // Best effort — return empty on failure
        return [];
    }
}
//# sourceMappingURL=client.js.map