/**
 * Local embeddings using transformers.js
 * Queries NEVER leave the user's device - only vectors are sent to API
 */
import { pipeline } from "@xenova/transformers";
let embedder = null;
let initPromise = null;
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2"; // 384 dimensions, ~80MB
/**
 * Initialize the local embedding model (downloads on first use)
 */
export async function initEmbeddings() {
    if (embedder)
        return;
    if (!initPromise) {
        console.error("[engrm-mcp] Loading local embedding model...");
        initPromise = pipeline("feature-extraction", MODEL_NAME, {
            quantized: true, // Smaller model size
        });
    }
    embedder = await initPromise;
    console.error("[engrm-mcp] Embedding model ready");
}
/**
 * Generate embedding vector locally - text never leaves device
 */
export async function embedLocal(text) {
    if (!embedder) {
        await initEmbeddings();
    }
    if (!embedder) {
        throw new Error("Embedding model not initialized");
    }
    // Truncate to model's max length
    const truncated = text.slice(0, 512);
    const output = await embedder(truncated, {
        pooling: "mean",
        normalize: true,
    });
    // Convert to plain array
    return Array.from(output.data);
}
/**
 * Get embedding dimensions
 */
export function getEmbeddingDimensions() {
    return 384; // all-MiniLM-L6-v2 dimensions
}
