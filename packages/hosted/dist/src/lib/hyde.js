"use strict";
/**
 * HyDE (Hypothetical Document Embeddings)
 *
 * Generates a hypothetical answer to the query using a fast LLM,
 * then embeds that hypothetical answer instead of (or in addition to) the raw query.
 * This improves semantic recall for indirect/vague queries.
 *
 * Based on: "Precise Zero-Shot Dense Retrieval without Relevance Labels" (Gao et al., 2022)
 * https://arxiv.org/abs/2212.10496
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHypotheticalDocument = generateHypotheticalDocument;
exports.combineEmbeddings = combineEmbeddings;
exports.shouldUseHyDE = shouldUseHyDE;
exports.embedWithHyDEIfNeeded = embedWithHyDEIfNeeded;
exports.embedWithHyDE = embedWithHyDE;
const llm_1 = require("./llm");
const embeddings_1 = require("./embeddings");
// Use a fast model for HyDE generation
const HYDE_MODEL = "gpt-4o-mini";
/**
 * System prompt for HyDE document generation.
 * Instructs the LLM to write a document that would answer the query.
 */
const HYDE_SYSTEM_PROMPT = `You are a helpful assistant that generates hypothetical documents.
Given a user query, write a short paragraph (2-4 sentences) that would be the ideal answer to that query.
This hypothetical document will be used for semantic search, so include relevant keywords and concepts.
Write in a natural, informative style. Do not mention that this is hypothetical. Just write the answer as if it exists.`;
/**
 * Generate a hypothetical document and its embedding for a query.
 *
 * @param query The user's search query
 * @returns HyDEResult with hypothetical document and embedding
 */
async function generateHypotheticalDocument(query) {
    try {
        // Generate the hypothetical document using a fast LLM
        const hypotheticalDocument = await (0, llm_1.callLLM)(query, HYDE_SYSTEM_PROMPT, { model: HYDE_MODEL });
        // The LLM returns JSON format, but we want plain text for HyDE
        // Try to parse as JSON first, fall back to raw text
        let cleanDocument;
        try {
            const parsed = JSON.parse(hypotheticalDocument);
            cleanDocument = parsed.answer || parsed.document || parsed.content || hypotheticalDocument;
        }
        catch {
            // Not JSON or doesn't have expected fields, use as-is
            cleanDocument = hypotheticalDocument;
        }
        // Clean up the output - remove quotes if they're wrapping the whole thing
        cleanDocument = cleanDocument.trim().replace(/^["']|["']$/g, "");
        // Truncate to reasonable length for embedding
        if (cleanDocument.length > 1000) {
            cleanDocument = cleanDocument.slice(0, 1000);
        }
        // Generate embedding for the hypothetical document
        const embedding = await (0, embeddings_1.embedText)(cleanDocument);
        return {
            hypotheticalDocument: cleanDocument,
            embedding,
            success: true,
        };
    }
    catch (error) {
        const errorMessage = error instanceof llm_1.LLMError
            ? error.message
            : error instanceof Error
                ? error.message
                : "Unknown error generating hypothetical document";
        console.warn("[HyDE] Failed to generate hypothetical document:", errorMessage);
        return {
            hypotheticalDocument: query, // Fall back to original query
            embedding: await (0, embeddings_1.embedText)(query), // Fall back to query embedding
            success: false,
            error: errorMessage,
        };
    }
}
/**
 * Combine original query embedding with HyDE embedding using weighted average.
 * This provides the benefits of both: exact query matching + semantic expansion.
 *
 * @param queryEmbedding The original query embedding
 * @param hydeEmbedding The HyDE hypothetical document embedding
 * @param hydeWeight Weight for HyDE embedding (0-1). Higher = more reliance on HyDE.
 * @returns Combined embedding
 */
function combineEmbeddings(queryEmbedding, hydeEmbedding, hydeWeight = 0.7) {
    const queryWeight = 1 - hydeWeight;
    if (queryEmbedding.length !== hydeEmbedding.length) {
        console.warn("[HyDE] Embedding dimension mismatch, using HyDE only");
        return hydeEmbedding;
    }
    return queryEmbedding.map((q, i) => q * queryWeight + hydeEmbedding[i] * hydeWeight);
}
/**
 * Check if a query would benefit from HyDE.
 * HyDE is most helpful for vague, indirect, or complex queries.
 *
 * @param query The user query
 * @returns boolean indicating if HyDE should be used
 */
function shouldUseHyDE(query) {
    const normalized = query.toLowerCase().trim();
    // HyDE is beneficial for these patterns:
    const hydeBeneficialPatterns = [
        // Vague references
        /\b(recently|lately|before|earlier|previous|last time)\b/i,
        // Indirect questions
        /\b(what about|how about|tell me about|anything on|something about)\b/i,
        // Open-ended queries
        /\b(what did we|what have we|what was|what happened)\b/i,
        // Complex/multi-part queries
        /\b(and|also|as well|plus)\b.*\?/i,
        // Comparative queries
        /\b(compared to|versus|vs|difference between)\b/i,
    ];
    for (const pattern of hydeBeneficialPatterns) {
        if (pattern.test(normalized)) {
            return true;
        }
    }
    // Short queries might benefit from expansion
    if (normalized.length < 20) {
        return true;
    }
    // Queries with few keywords might benefit
    const words = normalized.split(/\s+/).filter(w => w.length > 3);
    if (words.length < 4) {
        return true;
    }
    return false;
}
/**
 * Confidence-gated HyDE embedding.
 *
 * Runs a cheap first-pass embedding. If retrieval confidence (computed
 * from the first-pass results) is below the threshold, re-embeds with
 * HyDE to improve recall. Saves the LLM call when results are already
 * strong.
 *
 * @param query User query
 * @param retrievalConfidence 0–1 confidence from first-pass results
 * @param confidenceThreshold Gate threshold (default 0.72)
 * @returns Embedding result with `gated` flag
 */
async function embedWithHyDEIfNeeded(query, retrievalConfidence, confidenceThreshold = 0.72) {
    if (retrievalConfidence >= confidenceThreshold) {
        const embedding = await (0, embeddings_1.embedText)(query);
        return { embedding, usedHyDE: false, gated: true };
    }
    const result = await embedWithHyDE(query, true);
    return { ...result, gated: false };
}
/**
 * Main HyDE function - generates embedding with optional HyDE enhancement.
 *
 * @param query The user query
 * @param enableHyDE Whether to enable HyDE generation
 * @returns Embedding (either query-only or query+HyDE combined)
 */
async function embedWithHyDE(query, enableHyDE = false) {
    // Get base query embedding first (always needed)
    const queryEmbedding = await (0, embeddings_1.embedText)(query);
    if (!enableHyDE) {
        return { embedding: queryEmbedding, usedHyDE: false };
    }
    // Check if HyDE would benefit this query
    if (!shouldUseHyDE(query)) {
        return { embedding: queryEmbedding, usedHyDE: false };
    }
    // Generate HyDE document and embedding
    const hydeResult = await generateHypotheticalDocument(query);
    if (!hydeResult.success) {
        console.warn("[HyDE] Falling back to query-only embedding due to HyDE failure");
        return { embedding: queryEmbedding, usedHyDE: false };
    }
    // Combine embeddings with 70% weight on HyDE (empirically good balance)
    const combinedEmbedding = combineEmbeddings(queryEmbedding, hydeResult.embedding, 0.7);
    return {
        embedding: combinedEmbedding,
        usedHyDE: true,
        hypotheticalDocument: hydeResult.hypotheticalDocument,
    };
}
//# sourceMappingURL=hyde.js.map