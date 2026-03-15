/**
 * Collective Intelligence — Anonymizer
 *
 * PARANOID security layer. Strips ALL identifying information from traces.
 * When in doubt, strip it out.
 */
import type { TraceData, SharedSignal } from "./types.js";
/**
 * Anonymize a trace into a SharedSignal.
 * Returns null if the trace can't be safely anonymized.
 */
export declare function anonymizeTrace(trace: TraceData): SharedSignal | null;
/**
 * Double-check that nothing leaked through anonymization.
 * PARANOID: reject anything that looks even slightly suspicious.
 */
export declare function isShareSafe(signal: SharedSignal): boolean;
//# sourceMappingURL=anonymizer.d.ts.map