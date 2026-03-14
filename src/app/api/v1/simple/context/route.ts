/**
 * Simple Context Endpoint
 * 
 * Get formatted context string ready to inject into prompts.
 * Returns human-readable text, not JSON.
 */

import { embedQuery } from "@/lib/embeddings";
import { semanticSearchVectors } from "@/lib/qdrant";
import { bm25Search, rrfFusion, ensureFtsInitialized } from "@/lib/fts";
import {
  filterSensitiveMemories,
  getCriticalMemories,
  getAgentMemoriesByIds,
  incrementAccessCounts,
  listCriticalSynthesizedMemories,
  logRetrievalEvaluation,
} from "@/lib/db";
import { recordInjectionEvent } from "@/lib/memory-analytics";
import { validateApiKey } from "@/lib/api-auth";
import { assertEntitlement, EntitlementFeature, hasEntitlement } from "@/lib/entitlements";
import { FatHippoError, errorResponse } from "@/lib/errors";
import {
  getRequestedNamespace,
  isObject,
  resolveNamespaceIdOrError,
} from "@/lib/api-v1";
import { detectSecretQueryIntent, VAULT_HINT_MESSAGE } from "@/lib/secrets";
import { expandQuery, detectQueryIntent, mergeExpandedResults } from "@/lib/query-expansion";
import { calculateTypeBoost, type MemoryType } from "@/lib/memory-classifier";
import { embedWithHyDE, embedWithHyDEIfNeeded } from "@/lib/hyde";
import { parseTemporalQuery, applyTemporalBoost } from "@/lib/temporal";
import { rerankMemories, rerankIfNeeded } from "@/lib/reranker";
import {
  getRetrievalConfig,
  computeRetrievalConfidence,
  createHostedMetrics,
  type HostedServiceMetrics,
} from "@/lib/retrieval-config";
import { localRetrieve, localStoreResult, recordShadowSample } from "@/lib/local-retrieval";
import { isInEdgeRollout } from "@/lib/edge-rollout";
import {
  computeCompactionRiskScore,
  estimateFlushQuality,
  countMissingConstraints,
  recordCompactionSafetySample,
} from "@/lib/compaction-safety";
import type { MemoryRecord } from "@/lib/types";

export const runtime = "nodejs";

const TRIVIAL_ACKS = new Set([
  "ok",
  "thanks",
  "yes",
  "no",
  "sure",
  "cool",
  "nice",
  "got it",
  "k",
  "ty",
  "thx",
]);

// Default retrieval parameters (can be overridden via request body for testing)
// Tuned via autoresearch: sim=0.55 + topK=40 yields 84% MRR (vs 20% with old defaults)
const DEFAULT_MIN_VECTOR_SIMILARITY = 0.55;
const DEFAULT_MIN_CRITICAL_RELEVANCE = 0.5;
const DEFAULT_VECTOR_TOPK = 40;
const DEFAULT_RRF_K = 60;
const DEFAULT_BM25_WEIGHT = 1.2;

// Circuit breaker state for edge-first retrieval (process-local only)
const CB_LOW_CONFIDENCE_THRESHOLD = 5; // consecutive low-confidence lookups to trigger
const CB_COOLDOWN_LOOKUPS = 30; // lookups to skip after triggering
let cbConsecutiveLowConfidence = 0;
let cbCooldownRemaining = 0;

function isTrivialQuery(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.length < 3) {
    return true;
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (TRIVIAL_ACKS.has(normalized)) {
    return true;
  }

  if (/^[\p{P}\s]+$/u.test(trimmed)) {
    return true;
  }

  if (/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200D|\uFE0F|\s)+$/u.test(trimmed)) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.context");
    const body = (await request.json().catch(() => null)) as unknown;

    if (!isObject(body)) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "body", reason: "Invalid request body" });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const requestedNamespace = getRequestedNamespace(
      request,
      typeof body.namespace === "string" ? body.namespace : undefined,
    );
    const resolvedNamespace = await resolveNamespaceIdOrError(
      identity.userId,
      requestedNamespace.name,
      {
        createIfMissing: requestedNamespace.autoCreateIfMissing,
      },
    );
    if (resolvedNamespace.error) {
      return resolvedNamespace.error;
    }
    const namespaceId = resolvedNamespace.namespaceId;
    const trivialQuery = isTrivialQuery(message);

    if (!message || trivialQuery) {
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const secretQuery = detectSecretQueryIntent(message);
    if (secretQuery.isSecretQuery) {
      return Response.json({
        vault_hint: VAULT_HINT_MESSAGE,
        matched_categories: secretQuery.matchedCategories,
      });
    }
    
    // Limits for context window efficiency (default: 5 critical + 5 relevant = 10 total)
    const maxCritical = typeof body.maxCritical === "number" ? Math.min(body.maxCritical, 10) : 5;
    const maxRelevant = typeof body.maxRelevant === "number" ? Math.min(body.maxRelevant, 10) : 5;

    // Retrieval tuning params (for autoresearch experiments)
    const minVectorSimilarity = typeof body.minVectorSimilarity === "number" 
      ? Math.max(0.3, Math.min(0.95, body.minVectorSimilarity)) 
      : DEFAULT_MIN_VECTOR_SIMILARITY;
    const minCriticalRelevance = typeof body.minCriticalRelevance === "number"
      ? Math.max(0.3, Math.min(0.95, body.minCriticalRelevance))
      : DEFAULT_MIN_CRITICAL_RELEVANCE;
    const vectorTopK = typeof body.vectorTopK === "number"
      ? Math.max(5, Math.min(100, body.vectorTopK))
      : DEFAULT_VECTOR_TOPK;
    const rrfK = typeof body.rrfK === "number"
      ? Math.max(10, Math.min(200, body.rrfK))
      : DEFAULT_RRF_K;
    const bm25Weight = typeof body.bm25Weight === "number"
      ? Math.max(0.1, Math.min(5.0, body.bm25Weight))
      : DEFAULT_BM25_WEIGHT;
    
    // Type boost factor for intent-matched memories (1.0 = no boost, 1.3 = 30% boost)
    const typeBoostFactor = typeof body.typeBoostFactor === "number"
      ? Math.max(1.0, Math.min(2.0, body.typeBoostFactor))
      : 1.3; // Default: 30% boost for type match

    // Legacy flags (still honored for backward compatibility)
    const enableHyDE = body.hyde === true;
    const enableRerank = body.rerank === true;
    
    // New confidence-gated hosted services (from config or request override)
    const retrievalConfig = getRetrievalConfig();
    const requestedHostedHyde = enableHyDE || body.hostedHyde === true;
    const requestedHostedRerank = enableRerank || body.hostedRerank === true;
    let hostedHydeEnabled = requestedHostedHyde || retrievalConfig.hostedHydeEnabled;
    let hostedRerankEnabled = requestedHostedRerank || retrievalConfig.hostedRerankEnabled;
    const confidenceThreshold = typeof body.confidenceThreshold === "number"
      ? Math.max(0.5, Math.min(0.95, body.confidenceThreshold))
      : retrievalConfig.confidenceThreshold;

    if (requestedHostedHyde) {
      await assertEntitlement(identity.userId, EntitlementFeature.HostedHyde);
    } else if (hostedHydeEnabled && !(await hasEntitlement(identity.userId, EntitlementFeature.HostedHyde))) {
      hostedHydeEnabled = false;
    }

    if (requestedHostedRerank) {
      await assertEntitlement(identity.userId, EntitlementFeature.HostedRerank);
    } else if (
      hostedRerankEnabled &&
      !(await hasEntitlement(identity.userId, EntitlementFeature.HostedRerank))
    ) {
      hostedRerankEnabled = false;
    }
    
    // Initialize metrics for hosted service tracking
    const hostedMetrics: HostedServiceMetrics = createHostedMetrics();
    const enableTemporal = body.temporal !== false;
    const enableEdgeFirst = body.edgeFirst === true;
    const enableEdgeShadow = enableEdgeFirst && body.edgeShadowMode === true;

    // Edge-first tuning parameters
    const edgeMinConfidence = typeof body.edgeMinConfidence === "number"
      ? Math.max(0.5, Math.min(0.98, body.edgeMinConfidence))
      : 0.8;
    const edgeMaxIds = typeof body.edgeMaxIds === "number"
      ? Math.max(1, Math.min(20, body.edgeMaxIds))
      : maxRelevant;
    const edgeRolloutPct = typeof body.edgeRolloutPct === "number"
      ? Math.max(0, Math.min(100, body.edgeRolloutPct))
      : 100;
    const edgeSeed = typeof body.edgeSeed === "string" ? body.edgeSeed : "";

    // Edge-first retrieval: try local cache before expensive hybrid search
    let edgeHit = false;
    let edgeMemoryIds: string[] = [];
    let edgeConfidence = 0;
    let edgeCbActive = false;
    let edgeRolloutActive = false;
    let latencyMsEdgeLookup = 0;
    const edgeLookupStart = enableEdgeFirst ? performance.now() : 0;

    if (enableEdgeFirst) {
      // Check if user is in rollout percentage
      edgeRolloutActive = isInEdgeRollout(identity.userId, edgeRolloutPct, edgeSeed);

      if (edgeRolloutActive) {
        // Check circuit breaker state
        edgeCbActive = cbCooldownRemaining > 0;
        if (edgeCbActive) {
          cbCooldownRemaining -= 1;
        } else {
          const localResult = await localRetrieve(message, identity.userId);
          latencyMsEdgeLookup = Math.round(performance.now() - edgeLookupStart);
          edgeConfidence = localResult.confidence;
          edgeHit = localResult.hit && localResult.confidence >= edgeMinConfidence;
          // In shadow mode, we still compute edge candidates but don't use them for selection
          if (localResult.hit) {
            edgeMemoryIds = localResult.memoryIds.slice(0, edgeMaxIds);
          }
          // Circuit breaker: track consecutive low-confidence lookups
          if (localResult.hit && localResult.confidence < edgeMinConfidence) {
            cbConsecutiveLowConfidence += 1;
            if (cbConsecutiveLowConfidence >= CB_LOW_CONFIDENCE_THRESHOLD) {
              cbCooldownRemaining = CB_COOLDOWN_LOOKUPS;
              cbConsecutiveLowConfidence = 0;
            }
          } else {
            cbConsecutiveLowConfidence = 0;
          }
        }
      }
    }

    // Get critical memories
    const allCriticalMemories = filterSensitiveMemories(
      await getCriticalMemories(identity.userId, {
        excludeCompleted: true,
        excludeAbsorbed: true,
      }),
    );
    const criticalSyntheses = await listCriticalSynthesizedMemories(identity.userId, maxCritical);
    const synthesizedCritical = criticalSyntheses.map((synthesis) => ({
      id: synthesis.id,
      userId: synthesis.userId,
      title: synthesis.title,
      text: synthesis.synthesis,
      sourceType: "text" as const,
      memoryType: "semantic" as const,
      importanceTier: "critical" as const,
      durabilityClass: "durable" as const,
      sourceUrl: null,
      fileName: null,
      metadata: null,
      namespaceId: null,
      sessionId: null,
      entities: [],
      feedbackScore: 0,
      accessCount: synthesis.accessCount,
      sensitive: false,
      createdAt: synthesis.synthesizedAt,
    }));
    const allCritical = [...synthesizedCritical, ...allCriticalMemories];
    const criticalById = new Map(allCritical.map((memory) => [memory.id, memory]));
    
    let criticalMemories: typeof allCritical = [];
    let hydeDocument: string | undefined;
    if (allCritical.length > 0 && maxCritical > 0) {
      // First pass: get initial embedding (may use legacy HyDE flag)
      const criticalVector = enableHyDE
        ? (await embedWithHyDE(message, true)).embedding
        : await embedQuery(message);

      const criticalHits = await semanticSearchVectors({
        userId: identity.userId,
        query: message,
        vector: criticalVector,
        topK: maxCritical * 4,
      });

      // Compute retrieval confidence from critical hits
      const criticalScores = criticalHits.map((h) => h.score);
      const criticalConfidence = computeRetrievalConfidence(criticalScores, retrievalConfig);
      hostedMetrics.retrievalConfidence = Math.max(hostedMetrics.retrievalConfidence, criticalConfidence);

      let candidateMemories = criticalHits
        .filter((h) => h.score > minCriticalRelevance)
        .map((h) => criticalById.get(h.item.id) ?? null)
        .filter((memory): memory is NonNullable<typeof memory> => Boolean(memory));

      // Confidence-gated reranking for critical memories
      if ((enableRerank || hostedRerankEnabled) && candidateMemories.length > maxCritical) {
        if (hostedRerankEnabled) {
          // Use confidence-gated reranker
          const rerankStart = performance.now();
          const rerankResult = await rerankIfNeeded(
            message,
            candidateMemories,
            criticalConfidence,
            confidenceThreshold,
            { topK: maxCritical * 4, returnK: maxCritical, minScore: 60 }
          );
          hostedMetrics.rerankLatencyMs = Math.round(performance.now() - rerankStart);
          hostedMetrics.rerankGated = rerankResult.gated;
          hostedMetrics.usedHostedRerank = !rerankResult.gated && rerankResult.success;

          if (rerankResult.success) {
            candidateMemories = rerankResult.memories;
          } else {
            candidateMemories = candidateMemories.slice(0, maxCritical);
          }
        } else {
          // Legacy: always rerank when flag is set
          const rerankResult = await rerankMemories(message, candidateMemories, {
            topK: maxCritical * 4,
            returnK: maxCritical,
            minScore: 60,
          });

          if (rerankResult.success) {
            candidateMemories = rerankResult.memories;
          } else {
            candidateMemories = candidateMemories.slice(0, maxCritical);
          }
        }
      } else {
        candidateMemories = candidateMemories.slice(0, maxCritical);
      }

      criticalMemories = candidateMemories;
    }

    let relevantMemories: typeof criticalMemories = [];
    let shadowOverlapAtK = 0;
    let edgeCandidateCount = 0;
    let hostedCandidateCount = 0;

    try {
      const queryIntent = detectQueryIntent(message);
      const queries = queryIntent !== 'general' ? expandQuery(message) : [message];

      // Parse temporal references for time-based boosting
      const temporalParse = enableTemporal ? parseTemporalQuery(message) : null;
      const hasTemporalWindow = temporalParse?.hasTemporalReference && temporalParse?.timeWindow;

      // Run searches for all query variants in parallel
      const allSearchResults = await Promise.all(
        queries.map(async (queryText, queryIndex) => {
          const [vectorResults, bm25Results] = await Promise.all([
            (async () => {
              // Use HyDE for the first (primary) query when enabled
              // HyDE generates a hypothetical answer and embeds that instead of raw query
              let vector: number[];
              if (queryIndex === 0 && (enableHyDE || hostedHydeEnabled)) {
                if (hostedHydeEnabled && !enableHyDE) {
                  // Confidence-gated HyDE: will be applied after first-pass retrieval
                  // For now, just embed normally
                  vector = await embedQuery(queryText);
                } else {
                  // Legacy: always use HyDE when flag is set
                  const hydeResult = await embedWithHyDE(queryText, true);
                  vector = hydeResult.embedding;
                  if (hydeResult.usedHyDE) {
                    hydeDocument = hydeResult.hypotheticalDocument;
                  }
                }
              } else {
                vector = await embedQuery(queryText);
              }

              const hits = await semanticSearchVectors({
                userId: identity.userId,
                query: queryText,
                vector,
                topK: vectorTopK,
              });
              return hits
                .map((h) => ({ id: h.item.id, score: h.score }))
                .filter((h) => h.score >= minVectorSimilarity);
            })(),
            (async () => {
              try {
                await ensureFtsInitialized();
                return await bm25Search({
                  userId: identity.userId,
                  query: queryText,
                  topK: vectorTopK,
                });
              } catch {
                return []; // FTS not ready
              }
            })(),
          ]);
          return { vectorResults, bm25Results };
        })
      );

      // Merge results from all query variants
      const allVectorResults = mergeExpandedResults(
        allSearchResults.map((r) => r.vectorResults)
      );
      const allBm25Results = allSearchResults.flatMap((r) => r.bm25Results);
      const vectorResults = allVectorResults;
      const bm25Results = allBm25Results;

      // Combine with RRF fusion, allowing BM25-only rescues for exact lexical matches.
      // Get top 20 for reranking pipeline (we'll filter down to 5 after reranking)
      const rrfTopK = enableRerank ? 20 : 10;
      let memoryIds: string[] = [];

      // Edge-first: prepend edge cache hits before hybrid search results (unless shadow mode)
      // In shadow mode, hosted/hybrid selection remains source of truth; edge candidates are only for comparison
      if (edgeHit && edgeMemoryIds.length > 0 && !enableEdgeShadow) {
        memoryIds = edgeMemoryIds.slice(0, maxRelevant);
      }

      // Add hybrid search results (excluding duplicates from edge when not in shadow mode)
      const edgeIdSet = new Set(enableEdgeShadow ? [] : memoryIds);
      let hybridIds: string[] = [];
      if (vectorResults.length > 0 && bm25Results.length > 0) {
        const fused = rrfFusion(vectorResults, bm25Results, {
          k: rrfK,
          bm25Weight: bm25Weight,
        });
        hybridIds = fused.map((r) => r.memoryId);
      } else if (vectorResults.length > 0) {
        hybridIds = vectorResults.map((r) => r.id);
      } else if (bm25Results.length > 0) {
        hybridIds = bm25Results.map((r) => r.memoryId);
      }

      // Merge edge and hybrid results, preserving edge priority
      for (const id of hybridIds) {
        if (!edgeIdSet.has(id)) {
          memoryIds.push(id);
        }
      }
      memoryIds = memoryIds.slice(0, rrfTopK);

      // Compute shadow mode comparison metrics (edge vs hosted)
      edgeCandidateCount = edgeMemoryIds.length;
      hostedCandidateCount = memoryIds.length;
      if (enableEdgeShadow && edgeMemoryIds.length > 0) {
        const edgeSet = new Set(edgeMemoryIds.slice(0, maxRelevant));
        const hostedSet = new Set(memoryIds.slice(0, maxRelevant));
        const intersection = new Set([...edgeSet].filter((id) => hostedSet.has(id)));
        const union = new Set([...edgeSet, ...hostedSet]);
        shadowOverlapAtK = union.size > 0 ? intersection.size / union.size : 0;
      }

      if (memoryIds.length > 0) {
        const memories = filterSensitiveMemories(await getAgentMemoriesByIds({
          userId: identity.userId,
          ids: memoryIds,
          namespaceId,
          excludeAbsorbed: true,
        }));

        relevantMemories = memories.filter(
          (m) => m.importanceTier === "high" || m.importanceTier === "normal"
        );

        // Apply type-based boost when query intent matches memory type
        let scoredMemories: Array<{ memory: typeof relevantMemories[0]; score: number; originalIndex: number }> = [];
        if (queryIntent !== 'general' && relevantMemories.length > 1 && typeBoostFactor > 1.0) {
          // Score each memory based on type match (tunable via typeBoostFactor)
          scoredMemories = relevantMemories.map((m, originalIndex) => {
            const metadata = m.metadata as Record<string, unknown> | null;
            const classifiedType = (metadata?.classified as Record<string, unknown>)?.type as MemoryType | undefined;

            let boost = 1.0;
            if (classifiedType) {
              const baseBoost = calculateTypeBoost(queryIntent, classifiedType);
              boost = baseBoost > 1.0 ? 1.0 + (baseBoost - 1.0) * (typeBoostFactor / 1.3) : 1.0;
            }

            return { memory: m, score: boost * (1 / (originalIndex + 1)), originalIndex };
          });

          scoredMemories.sort((a, b) => b.score - a.score);
          relevantMemories = scoredMemories.map((s) => s.memory);
        }

        // Apply temporal boost when temporal references are detected
        if (hasTemporalWindow && temporalParse.timeWindow && relevantMemories.length > 0) {
          const memoriesToBoost = scoredMemories.length > 0
            ? scoredMemories
            : relevantMemories.map((m, i) => ({ memory: m, score: 1 / (i + 1), originalIndex: i }));

          const boosted = applyTemporalBoost(memoriesToBoost, temporalParse.timeWindow, 1.4);
          boosted.sort((a, b) => b.score - a.score);
          relevantMemories = boosted.map((s) => s.memory);
        }

        // Compute retrieval confidence from vector results for gating decisions
        const relevantScores = vectorResults.map((r) => r.score);
        const relevantConfidence = computeRetrievalConfidence(relevantScores, retrievalConfig);
        hostedMetrics.retrievalConfidence = Math.max(hostedMetrics.retrievalConfidence, relevantConfidence);

        // Confidence-gated HyDE: re-embed with HyDE if confidence is low
        if (hostedHydeEnabled && !enableHyDE && relevantConfidence < confidenceThreshold && relevantMemories.length < 3) {
          const hydeStart = performance.now();
          const hydeResult = await embedWithHyDEIfNeeded(message, relevantConfidence, confidenceThreshold);
          hostedMetrics.hydeLatencyMs = Math.round(performance.now() - hydeStart);
          hostedMetrics.hydeGated = hydeResult.gated;
          hostedMetrics.usedHostedHyde = !hydeResult.gated;
          
          if (!hydeResult.gated && hydeResult.hypotheticalDocument) {
            hydeDocument = hydeResult.hypotheticalDocument;
            // Re-search with HyDE embedding for better recall
            const hydeHits = await semanticSearchVectors({
              userId: identity.userId,
              query: message,
              vector: hydeResult.embedding,
              topK: vectorTopK,
            });
            const hydeIds = hydeHits
              .filter((h) => h.score >= minVectorSimilarity)
              .map((h) => h.item.id);
            
            // Merge HyDE results with existing (HyDE results first)
            const existingIds = new Set(relevantMemories.map((m) => m.id));
            const newIds = hydeIds.filter((id) => !existingIds.has(id));
            if (newIds.length > 0) {
              const newMemories = filterSensitiveMemories(await getAgentMemoriesByIds({
                userId: identity.userId,
                ids: newIds,
                namespaceId,
                excludeAbsorbed: true,
              }));
              relevantMemories = [...relevantMemories, ...newMemories.filter(
                (m) => m.importanceTier === "high" || m.importanceTier === "normal"
              )];
            }
          }
        }

        // LLM Reranking: use LLM to judge relevance and return top 5
        if ((enableRerank || hostedRerankEnabled) && relevantMemories.length > 5) {
          if (hostedRerankEnabled && !enableRerank) {
            // Confidence-gated reranking
            const rerankStart = performance.now();
            const rerankResult = await rerankIfNeeded(
              message,
              relevantMemories,
              relevantConfidence,
              confidenceThreshold,
              { topK: 20, returnK: 5, minScore: 60 }
            );
            hostedMetrics.rerankLatencyMs = Math.max(hostedMetrics.rerankLatencyMs, Math.round(performance.now() - rerankStart));
            hostedMetrics.rerankGated = hostedMetrics.rerankGated || rerankResult.gated;
            hostedMetrics.usedHostedRerank = hostedMetrics.usedHostedRerank || (!rerankResult.gated && rerankResult.success);

            if (rerankResult.success) {
              relevantMemories = rerankResult.memories;
            }
          } else {
            // Legacy: always rerank when flag is set
            const rerankResult = await rerankMemories(message, relevantMemories, {
              topK: 20,
              returnK: 5,
              minScore: 60,
            });

            if (rerankResult.success) {
              relevantMemories = rerankResult.memories;
            }
          }
        }

        // Track access
        const accessedIds = memories.map((m) => m.id);
        incrementAccessCounts(identity.userId, accessedIds).catch(() => {});
      }
    } catch {
      // Search failed, continue with critical only
    }

    // Dedupe and limit relevant memories
    const criticalIds = new Set(criticalMemories.map((m) => m.id));
    const dedupedRelevant = relevantMemories
      .filter((m) => !criticalIds.has(m.id))
      .slice(0, maxRelevant);

    if (enableEdgeFirst && !edgeHit) {
      const candidateIds = dedupedRelevant.map((m) => m.id);
      if (candidateIds.length > 0) {
        localStoreResult(identity.userId, message, candidateIds, 0.85);
      }
    }

    const hasDurableMemories = [...criticalMemories, ...dedupedRelevant].some(
      (m) => m.durabilityClass === "durable",
    );
    const compactionRiskScore = computeCompactionRiskScore({
      messageLength: message.length,
      criticalCount: criticalMemories.length,
      relevantCount: dedupedRelevant.length,
      edgeEnabled: enableEdgeFirst,
    });
    const flushQuality = estimateFlushQuality({
      hasCritical: criticalMemories.length > 0,
      hasDurableMemories,
      relevantCount: dedupedRelevant.length,
    });

    // Build formatted context string
    const lines: string[] = [];
    
    if (criticalMemories.length > 0 || dedupedRelevant.length > 0) {
      lines.push("Here's what you know about this user:");
      lines.push("");
    }

    // Add critical memories
    if (criticalMemories.length > 0) {
      lines.push("## Core Information");
      for (const m of criticalMemories) {
        lines.push(`- ${m.text}`);
      }
      lines.push("");
    }

    // Add relevant memories
    if (dedupedRelevant.length > 0) {
      lines.push("## Relevant Context");
      for (const m of dedupedRelevant) {
        lines.push(`- ${m.text}`);
      }
      lines.push("");
    }

    // Add instruction if we have context
    if (lines.length > 0) {
      lines.push("Use this context to personalize your responses.");
    }

    const context = lines.join("\n");

    const constraintRegex = /\b(must|never|always|do not|don't|cannot|can't)\b/i;
    const beforeConstraints = [...criticalMemories, ...dedupedRelevant]
      .map((m) => m.text)
      .filter((t) => constraintRegex.test(t));
    const afterConstraints = context
      .split("\n")
      .filter((line) => constraintRegex.test(line));
    const missingConstraints = countMissingConstraints(beforeConstraints, afterConstraints);

    recordCompactionSafetySample({
      riskScore: compactionRiskScore,
      flushQuality,
      missingConstraints,
    });

    // Record injection event for analytics (non-blocking)
    const allInjectedIds = [
      ...criticalMemories.map((m) => m.id),
      ...dedupedRelevant.map((m) => m.id),
    ];
    const evaluation = await logRetrievalEvaluation({
      userId: identity.userId,
      query: message,
      endpoint: "/api/v1/simple/context",
      namespaceId,
      sessionId: conversationId ?? null,
      candidateIds: allInjectedIds,
    });
    if (allInjectedIds.length > 0) {
      recordInjectionEvent({
        userId: identity.userId,
        memoryIds: allInjectedIds,
        resultCount: allInjectedIds.length,
        conversationId: conversationId ?? undefined,
      }).catch(() => {});
    }

    // Return as plain text with content-type header
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
    };

    if (evaluation) {
      headers["X-FatHippo-Eval-Id"] = evaluation.id;
    }

    if (enableEdgeFirst) {
      headers["X-FatHippo-Edge-First"] = "on";
      headers["X-FatHippo-Edge-Hit"] = edgeHit ? "true" : "false";
      headers["X-FatHippo-Edge-Confidence"] = edgeConfidence.toFixed(3);
      headers["X-FatHippo-Edge-CB"] = edgeCbActive ? "on" : "off";
      headers["X-FatHippo-Edge-Min-Confidence"] = edgeMinConfidence.toFixed(2);
      headers["X-FatHippo-Edge-Rollout"] = edgeRolloutActive ? "active" : "skipped";
    }

    if (enableEdgeShadow) {
      headers["X-FatHippo-Edge-Shadow"] = "on";
      headers["X-FatHippo-Edge-Overlap"] = shadowOverlapAtK.toFixed(4);
      headers["X-FatHippo-Edge-Latency-Ms"] = String(latencyMsEdgeLookup);
      headers["X-FatHippo-Edge-Candidates"] = String(edgeCandidateCount);
      headers["X-FatHippo-Hosted-Candidates"] = String(hostedCandidateCount);
      recordShadowSample(shadowOverlapAtK);
    }

    headers["X-FatHippo-Compaction-Risk"] = compactionRiskScore.toFixed(4);
    headers["X-FatHippo-Flush-Quality"] = flushQuality.toFixed(4);
    headers["X-FatHippo-Constraint-Diff-Missing"] = String(missingConstraints);

    // Hosted service metrics (P0#3: confidence-gated HyDE/rerank)
    if (hostedHydeEnabled || hostedRerankEnabled) {
      headers["X-FatHippo-Hosted-Enabled"] = "on";
      headers["X-FatHippo-Retrieval-Confidence"] = hostedMetrics.retrievalConfidence.toFixed(4);
      headers["X-FatHippo-Confidence-Threshold"] = confidenceThreshold.toFixed(2);
      
      if (hostedHydeEnabled) {
        headers["X-FatHippo-Hyde-Used"] = hostedMetrics.usedHostedHyde ? "true" : "false";
        headers["X-FatHippo-Hyde-Gated"] = hostedMetrics.hydeGated ? "true" : "false";
        if (hostedMetrics.hydeLatencyMs > 0) {
          headers["X-FatHippo-Hyde-Latency-Ms"] = String(hostedMetrics.hydeLatencyMs);
        }
      }
      
      if (hostedRerankEnabled) {
        headers["X-FatHippo-Rerank-Used"] = hostedMetrics.usedHostedRerank ? "true" : "false";
        headers["X-FatHippo-Rerank-Gated"] = hostedMetrics.rerankGated ? "true" : "false";
        if (hostedMetrics.rerankLatencyMs > 0) {
          headers["X-FatHippo-Rerank-Latency-Ms"] = String(hostedMetrics.rerankLatencyMs);
        }
      }
    }

    return new Response(context, {
      status: 200,
      headers,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
