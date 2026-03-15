/**
 * User DNA Serializer
 *
 * Formats User DNA for context injection.
 * Target: under 500 tokens, compact markdown.
 */
import type { UserDNA } from "./types.js";
/**
 * Format User DNA as a compact markdown block for context injection.
 * Only includes sections where confidence > 0.2.
 * Target: under 500 tokens.
 */
export declare function formatUserDNAForInjection(dna: UserDNA): string;
//# sourceMappingURL=serializer.d.ts.map