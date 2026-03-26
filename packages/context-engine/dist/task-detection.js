/**
 * Task Detection — lightweight keyword-based classifier
 *
 * Analyzes the last 3-5 messages to determine what the user is doing.
 * Pure heuristics, no LLM calls. Target: <1ms execution.
 */
// Pre-compiled patterns per task type for fast matching
const TASK_PATTERNS = {
    debugging: [
        /\berror\b/i,
        /\bbug\b/i,
        /\bfix\b/i,
        /\bbroken\b/i,
        /\bfailed\b/i,
        /\bnot working\b/i,
        /\bexception\b/i,
        /\bcrash(?:ed|es|ing)?\b/i,
        /\bTypeError\b/,
        /\bReferenceError\b/,
        /\bSyntaxError\b/,
        /\bundefined\b/i,
        /\bnull pointer\b/i,
        /\bstack trace\b/i,
        /\bsegfault\b/i,
        /\bECONN\w+/,
        /\bENOENT\b/,
        /\bMODULE_NOT_FOUND\b/,
        /\bSQLITE_\w+/,
        /\bat line \d+/i,
        /\b(?:debug|debugger|debugging)\b/i,
        /\bnot defined\b/i,
        /\bunexpected token\b/i,
        /\bcannot read propert/i,
        /\bfails?\b/i,
    ],
    building: [
        /\bcreate\b/i,
        /\bbuild\b/i,
        /\badd\b/i,
        /\bimplement\b/i,
        /\bnew feature\b/i,
        /\bscaffold\b/i,
        /\bgenerate\b/i,
        /\bset up\b/i,
        /\bsetup\b/i,
        /\binitialize\b/i,
        /\bbootstrap\b/i,
        /\bmake a\b/i,
        /\bwrite a\b/i,
        /\bnew (?:file|component|module|service|endpoint|page|route)\b/i,
    ],
    refactoring: [
        /\brefactor\b/i,
        /\bclean up\b/i,
        /\brename\b/i,
        /\bextract\b/i,
        /\bsplit\b/i,
        /\breorganize\b/i,
        /\bsimplify\b/i,
        /\brestructure\b/i,
        /\bDRY\b/,
        /\bdeduplicate\b/i,
        /\bconsolidate\b/i,
        /\bmove (?:to|into)\b/i,
        /\bdecompose\b/i,
    ],
    reviewing: [
        /\breview\b/i,
        /\bPR\b/,
        /\bpull request\b/i,
        /\bcode review\b/i,
        /\bdiff\b/i,
        /\bapprove\b/i,
        /\bmerge\b/i,
        /\blgtm\b/i,
        /\bchanges look\b/i,
        /\bcheck (?:this|the) (?:code|changes)\b/i,
    ],
    exploring: [
        /\bhow does\b/i,
        /\bwhat is\b/i,
        /\bexplain\b/i,
        /\bunderstand\b/i,
        /\bwhere is\b/i,
        /\bfind\b/i,
        /\bshow me\b/i,
        /\bwhat does\b/i,
        /\bwhy does\b/i,
        /\btell me about\b/i,
        /\bwalk me through\b/i,
        /\bhelp me understand\b/i,
    ],
};
// How many recent messages to analyze
const MAX_MESSAGES = 5;
/**
 * Detect what task the user is performing based on recent messages.
 *
 * Looks at the last 3-5 messages, counts keyword matches per task type,
 * and returns the highest-scoring type with a confidence score.
 */
export function detectTaskType(messages) {
    // Take only the last N messages
    const recent = messages.slice(-MAX_MESSAGES);
    if (recent.length === 0) {
        return { taskType: 'general', confidence: 0, signals: [] };
    }
    // Weight user messages more heavily than assistant/tool messages
    const scores = {
        debugging: 0,
        building: 0,
        refactoring: 0,
        reviewing: 0,
        exploring: 0,
    };
    const matchedSignals = {
        debugging: [],
        building: [],
        refactoring: [],
        reviewing: [],
        exploring: [],
    };
    for (const msg of recent) {
        const weight = msg.role === 'user' ? 2 : 1;
        const text = msg.content;
        for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
            for (const pattern of patterns) {
                const match = pattern.exec(text);
                if (match) {
                    scores[taskType] += weight;
                    const signal = match[0];
                    if (!matchedSignals[taskType].includes(signal)) {
                        matchedSignals[taskType].push(signal);
                    }
                }
            }
        }
    }
    // Find the winner
    let bestType = 'general';
    let bestScore = 0;
    let secondBest = 0;
    for (const [taskType, score] of Object.entries(scores)) {
        if (score > bestScore) {
            secondBest = bestScore;
            bestScore = score;
            bestType = taskType;
        }
        else if (score > secondBest) {
            secondBest = score;
        }
    }
    if (bestScore === 0) {
        return { taskType: 'general', confidence: 0, signals: [] };
    }
    // Confidence: based on margin over second-best and absolute score
    // Higher margin + more matches = higher confidence
    const margin = bestScore - secondBest;
    const marginConfidence = Math.min(margin / (bestScore + 1), 1);
    const absoluteConfidence = Math.min(bestScore / 8, 1); // 8+ matches = full confidence
    const confidence = Math.round((marginConfidence * 0.6 + absoluteConfidence * 0.4) * 100) / 100;
    return {
        taskType: bestType,
        confidence: Math.min(confidence, 1),
        signals: matchedSignals[bestType] ?? [],
    };
}
//# sourceMappingURL=task-detection.js.map