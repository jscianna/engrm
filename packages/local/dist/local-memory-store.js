import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const DEFAULT_MAX_MEMORIES = 500;
const DEFAULT_STORAGE_PATH = path.join(os.homedir(), ".openclaw", "fathippo-local.json");
const WORKFLOW_DEFINITIONS = {
    verify_first: {
        title: "Run verification first",
        steps: [
            "Reproduce the problem with the smallest test, build, or lint command available.",
            "Read the first failing output before editing files.",
            "Apply a minimal fix and rerun the same verification command.",
        ],
    },
    search_codebase_first: {
        title: "Search the codebase first",
        steps: [
            "Search for the failing symbol, route, or error text before editing.",
            "Inspect the current implementation and nearby similar code.",
            "Apply a focused patch, then verify.",
        ],
    },
    inspect_config_first: {
        title: "Inspect config first",
        steps: [
            "Open the relevant config, middleware, env, or build wiring first.",
            "Check matchers, plugin options, env loading, and config assumptions.",
            "Make the smallest config fix, then rerun verification.",
        ],
    },
    patch_then_verify: {
        title: "Apply the likely fix, then verify",
        steps: [
            "Use the strongest local learned fix to make a small targeted patch first.",
            "Avoid broad exploration unless the first patch fails.",
            "Immediately rerun verification after the patch.",
        ],
    },
};
function normalizeText(value) {
    return value.toLowerCase().trim().replace(/\s+/g, " ");
}
function tokenize(value) {
    return normalizeText(value)
        .split(" ")
        .map((token) => token.replace(/[^a-z0-9._/-]/g, ""))
        .filter((token) => token.length > 2)
        .slice(0, 32);
}
function jaccard(left, right) {
    if (left.length === 0 || right.length === 0) {
        return 0;
    }
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    let intersection = 0;
    for (const token of leftSet) {
        if (rightSet.has(token)) {
            intersection += 1;
        }
    }
    const union = new Set([...leftSet, ...rightSet]).size;
    return union === 0 ? 0 : intersection / union;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function summarizeContent(content, maxLength = 140) {
    const normalized = content.trim().replace(/\s+/g, " ");
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}
function makeTitle(content) {
    const summary = summarizeContent(content, 72);
    return summary || "Local memory";
}
function deriveImportanceTier(accessCount) {
    if (accessCount >= 12) {
        return "critical";
    }
    if (accessCount >= 5) {
        return "high";
    }
    return "normal";
}
function detectWorkflow(params) {
    const firstCategory = params.toolSignals
        ?.map((signal) => signal.category?.toLowerCase())
        .find((category) => Boolean(category) && category !== "unknown");
    const problem = normalizeText(params.problem);
    const filesModified = params.filesModified ?? [];
    const hasSearch = firstCategory === "search" ||
        params.toolSignals?.some((signal) => signal.category?.toLowerCase() === "search") === true;
    const configHeavy = /\bconfig|middleware|auth|env|tsconfig|package\.json|next\.config|eslint|docker|prisma|drizzle\b/.test(problem) ||
        filesModified.some((file) => /(config|middleware|auth|package\.json|tsconfig|next\.config|eslint|docker|prisma|drizzle)/i.test(file));
    if (firstCategory === "test" || firstCategory === "build" || firstCategory === "lint" || firstCategory === "run") {
        return "verify_first";
    }
    if (configHeavy) {
        return "inspect_config_first";
    }
    if (hasSearch) {
        return "search_codebase_first";
    }
    if ((params.verificationCommands?.length ?? 0) > 0) {
        return "patch_then_verify";
    }
    return "search_codebase_first";
}
function traceKeywords(trace) {
    return [
        ...tokenize(trace.problem),
        ...trace.technologies.map((value) => normalizeText(value)),
        ...trace.errorMessages.flatMap((value) => tokenize(value)),
        ...tokenize(trace.type),
    ].slice(0, 40);
}
function computeTraceSimilarity(problem, trace) {
    const base = jaccard(tokenize(problem), traceKeywords(trace));
    const substringBonus = normalizeText(trace.problem).includes(normalizeText(problem)) ||
        normalizeText(problem).includes(normalizeText(trace.problem))
        ? 0.15
        : 0;
    return base + substringBonus;
}
function scoreTraceOutcome(trace) {
    let score = trace.outcome === "success" ? 1 : trace.outcome === "partial" ? 0.35 : -0.5;
    if (trace.verificationCommands.length > 0) {
        score += 0.2;
    }
    if (trace.durationMs > 0) {
        score += clamp(0.15 - trace.durationMs / (45 * 60 * 1000), -0.1, 0.15);
    }
    return clamp(score, -1, 1.2);
}
function buildPatternTitle(trace) {
    const technology = trace.technologies[0];
    const prefix = technology ? `${technology} ` : "";
    const type = trace.type ? `${trace.type} ` : "";
    return `${prefix}${type}fix`.trim();
}
function summarizeApproach(trace) {
    const source = trace.solution || trace.reasoning || trace.problem;
    const normalized = source.trim().replace(/\s+/g, " ");
    return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}
async function ensureParentDir(storagePath) {
    await mkdir(path.dirname(storagePath), { recursive: true });
}
export function createLocalMemoryStore(options = {}) {
    const storagePath = options.storagePath ?? process.env.FATHIPPO_LOCAL_STORE_PATH ?? DEFAULT_STORAGE_PATH;
    const maxMemories = Math.max(50, options.maxMemories ?? DEFAULT_MAX_MEMORIES);
    const maxTraces = Math.max(50, Math.round(maxMemories * 0.5));
    let statePromise = null;
    async function loadState() {
        if (!statePromise) {
            statePromise = (async () => {
                try {
                    const raw = await readFile(storagePath, "utf8");
                    const parsed = JSON.parse(raw);
                    if (parsed &&
                        (parsed.version === 1 || parsed.version === 2) &&
                        parsed.profiles &&
                        typeof parsed.profiles === "object") {
                        const profiles = Object.fromEntries(Object.entries(parsed.profiles).map(([profileId, profile]) => [
                            profileId,
                            {
                                memories: Array.isArray(profile?.memories) ? profile.memories : [],
                                traces: Array.isArray(profile?.traces) ? profile.traces : [],
                            },
                        ]));
                        return { version: 2, profiles };
                    }
                }
                catch {
                    // Fall through to default store.
                }
                return { version: 2, profiles: {} };
            })();
        }
        return statePromise;
    }
    async function saveState(nextState) {
        statePromise = Promise.resolve(nextState);
        await ensureParentDir(storagePath);
        await writeFile(storagePath, JSON.stringify(nextState, null, 2), "utf8");
    }
    function getProfile(state, profileId) {
        if (!state.profiles[profileId]) {
            state.profiles[profileId] = { memories: [], traces: [] };
        }
        if (!Array.isArray(state.profiles[profileId].traces)) {
            state.profiles[profileId].traces = [];
        }
        return state.profiles[profileId];
    }
    function trimProfile(profile) {
        if (profile.memories.length > maxMemories) {
            profile.memories = profile.memories
                .slice()
                .sort((left, right) => {
                if (left.importanceTier !== right.importanceTier) {
                    const rank = { critical: 3, high: 2, normal: 1 };
                    return rank[right.importanceTier] - rank[left.importanceTier];
                }
                if (left.accessCount !== right.accessCount) {
                    return right.accessCount - left.accessCount;
                }
                return right.updatedAt.localeCompare(left.updatedAt);
            })
                .slice(0, maxMemories);
        }
        if (profile.traces.length > maxTraces) {
            profile.traces = profile.traces
                .slice()
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                .slice(0, maxTraces);
        }
    }
    return {
        async remember(params) {
            const state = await loadState();
            const profile = getProfile(state, params.profileId);
            const now = new Date().toISOString();
            const normalizedContent = normalizeText(params.content);
            const existing = profile.memories.find((memory) => normalizeText(memory.content) === normalizedContent);
            if (existing) {
                existing.updatedAt = now;
                existing.title = params.title?.trim() || existing.title || makeTitle(existing.content);
                await saveState(state);
                return existing;
            }
            const created = {
                id: `local_${crypto.randomUUID().replaceAll("-", "")}`,
                title: params.title?.trim() || makeTitle(params.content),
                content: params.content.trim(),
                createdAt: now,
                updatedAt: now,
                accessCount: 0,
                lastAccessedAt: null,
                importanceTier: "normal",
            };
            profile.memories.unshift(created);
            trimProfile(profile);
            await saveState(state);
            return created;
        },
        async search(params) {
            const state = await loadState();
            const profile = getProfile(state, params.profileId);
            const queryTokens = tokenize(params.query);
            const now = Date.now();
            const ranked = profile.memories
                .map((memory) => {
                const titleTokens = tokenize(memory.title);
                const contentTokens = tokenize(memory.content);
                const similarity = Math.max(jaccard(queryTokens, titleTokens), jaccard(queryTokens, contentTokens));
                const substringBonus = normalizeText(memory.content).includes(normalizeText(params.query)) ? 0.2 : 0;
                const recencyDays = Math.max(0, (now - Date.parse(memory.updatedAt)) / (24 * 60 * 60 * 1000));
                const recencyBonus = Math.max(0, 0.15 - recencyDays * 0.01);
                const score = similarity + substringBonus + recencyBonus + Math.min(0.2, memory.accessCount * 0.02);
                return { memory, score };
            })
                .filter((entry) => entry.score >= 0.12)
                .sort((left, right) => right.score - left.score || right.memory.updatedAt.localeCompare(left.memory.updatedAt))
                .slice(0, Math.max(1, Math.min(params.limit ?? 5, 10)));
            if (ranked.length > 0) {
                const touchedAt = new Date().toISOString();
                for (const entry of ranked) {
                    entry.memory.accessCount += 1;
                    entry.memory.lastAccessedAt = touchedAt;
                    entry.memory.importanceTier = deriveImportanceTier(entry.memory.accessCount);
                }
                await saveState(state);
            }
            return ranked;
        },
        async getCriticalMemories(params) {
            const state = await loadState();
            const profile = getProfile(state, params.profileId);
            return profile.memories
                .slice()
                .sort((left, right) => {
                const rank = { critical: 3, high: 2, normal: 1 };
                if (left.importanceTier !== right.importanceTier) {
                    return rank[right.importanceTier] - rank[left.importanceTier];
                }
                if (left.accessCount !== right.accessCount) {
                    return right.accessCount - left.accessCount;
                }
                return right.updatedAt.localeCompare(left.updatedAt);
            })
                .slice(0, Math.max(1, Math.min(params.limit ?? 15, 25)));
        },
        async getIndexedSummaries(params) {
            const state = await loadState();
            const profile = getProfile(state, params.profileId);
            const selected = profile.memories
                .slice()
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
                .slice(0, Math.max(1, Math.min(params.limit ?? 20, 30)));
            const indices = selected.map((memory) => ({
                index: memory.id,
                summary: summarizeContent(memory.content, 120),
                createdAt: memory.createdAt,
                updatedAt: memory.updatedAt,
                accessCount: memory.accessCount,
            }));
            return {
                indices,
                contextFormat: indices.map((memory) => `- ${memory.index}: ${memory.summary}`).join("\n"),
                count: indices.length,
            };
        },
        async getMemoriesByIds(profileId, ids) {
            const state = await loadState();
            const profile = getProfile(state, profileId);
            return ids
                .map((id) => profile.memories.find((memory) => memory.id === id))
                .filter((memory) => memory != null);
        },
        async learnTrace(params) {
            const state = await loadState();
            const profile = getProfile(state, params.profileId);
            const now = new Date().toISOString();
            const normalizedProblem = normalizeText(params.problem);
            if (!normalizedProblem || normalizedProblem.length < 8) {
                return null;
            }
            const existing = profile.traces.find((trace) => trace.type === params.type && normalizeText(trace.problem) === normalizedProblem);
            const nextTrace = existing ?? {
                id: `local_trace_${crypto.randomUUID().replaceAll("-", "")}`,
                type: params.type,
                problem: params.problem.trim(),
                reasoning: "",
                solution: null,
                outcome: params.outcome,
                technologies: [],
                errorMessages: [],
                verificationCommands: [],
                filesModified: [],
                durationMs: 0,
                workflow: "search_codebase_first",
                createdAt: now,
            };
            nextTrace.reasoning = params.reasoning.trim();
            nextTrace.solution = params.solution?.trim() || nextTrace.solution;
            nextTrace.outcome = params.outcome;
            nextTrace.technologies = (params.technologies ?? []).slice(0, 6);
            nextTrace.errorMessages = (params.errorMessages ?? []).slice(0, 5);
            nextTrace.verificationCommands = (params.verificationCommands ?? []).slice(0, 6);
            nextTrace.filesModified = (params.filesModified ?? []).slice(0, 25);
            nextTrace.durationMs = params.durationMs ?? nextTrace.durationMs;
            nextTrace.workflow = detectWorkflow(params);
            if (!existing) {
                profile.traces.unshift(nextTrace);
            }
            trimProfile(profile);
            await saveState(state);
            return nextTrace;
        },
        async getCognitiveContext(params) {
            const state = await loadState();
            const profile = getProfile(state, params.profileId);
            const limit = Math.max(1, Math.min(params.limit ?? 3, 5));
            const matches = profile.traces
                .map((trace) => ({
                trace,
                similarity: computeTraceSimilarity(params.problem, trace),
                outcomeScore: scoreTraceOutcome(trace),
            }))
                .filter((entry) => entry.similarity >= 0.14)
                .sort((left, right) => right.similarity - left.similarity ||
                right.outcomeScore - left.outcomeScore ||
                right.trace.createdAt.localeCompare(left.trace.createdAt))
                .slice(0, 12);
            const workflowStats = new Map();
            for (const entry of matches) {
                const current = workflowStats.get(entry.trace.workflow) ?? { count: 0, scoreSum: 0 };
                current.count += 1;
                current.scoreSum += entry.outcomeScore * (1 + entry.similarity);
                workflowStats.set(entry.trace.workflow, current);
            }
            let workflow = null;
            const bestWorkflow = [...workflowStats.entries()]
                .sort((left, right) => right[1].scoreSum - left[1].scoreSum || right[1].count - left[1].count)[0];
            if (bestWorkflow && bestWorkflow[1].scoreSum > 0) {
                const definition = WORKFLOW_DEFINITIONS[bestWorkflow[0]];
                workflow = {
                    key: bestWorkflow[0],
                    title: definition.title,
                    steps: definition.steps,
                    rationale: `Based on ${bestWorkflow[1].count} similar private fixes on this machine.`,
                    sampleCount: bestWorkflow[1].count,
                    score: Number((bestWorkflow[1].scoreSum / bestWorkflow[1].count).toFixed(2)),
                };
            }
            const patterns = matches
                .filter((entry) => entry.trace.outcome !== "failed")
                .slice(0, limit)
                .map((entry) => ({
                title: buildPatternTitle(entry.trace),
                approach: summarizeApproach(entry.trace),
                score: Number((entry.similarity + Math.max(0, entry.outcomeScore)).toFixed(2)),
            }));
            return { workflow, patterns };
        },
    };
}
//# sourceMappingURL=local-memory-store.js.map