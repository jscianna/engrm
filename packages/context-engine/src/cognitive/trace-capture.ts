import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { sanitizeCognitiveText, isShareEligible } from "./sanitize.js";

export type StructuredTracePayload = {
  sessionId: string;
  type: string;
  problem: string;
  context: {
    technologies: string[];
    errorMessages?: string[];
  };
  reasoning: string;
  approaches: Array<{ description: string; result: "worked" | "failed" | "partial"; learnings?: string }>;
  solution?: string;
  outcome: "success" | "partial" | "failed";
  heuristicOutcome: "success" | "partial" | "failed";
  automatedOutcome?: "success" | "failed";
  automatedSignals: Record<string, unknown>;
  errorMessage?: string;
  toolsUsed: string[];
  toolCalls: Array<Record<string, unknown>>;
  toolResults: Array<Record<string, unknown>>;
  verificationCommands: string[];
  retryCount: number;
  repoSignals: {
    filesModified: string[];
    languages: string[];
    diffSummary: string;
    workspaceRoot?: string;
  };
  resolutionKind: "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed";
  filesModified: string[];
  durationMs: number;
  sanitized: true;
  sanitizedAt: string;
  shareEligible: boolean;
};

type ToolSignalCategory = "test" | "build" | "lint" | "install" | "run" | "edit" | "search" | "unknown";

type ToolSignal = {
  toolName: string;
  category: ToolSignalCategory;
  command?: string;
  success?: boolean;
  exitCode?: number;
  isError?: boolean;
  outputSnippet?: string;
  errorSnippet?: string;
};

type ToolUseReference = {
  toolName: string;
  command?: string;
};

type AutomatedSignalSummary = {
  toolsUsed: string[];
  toolCallCount: number;
  toolResultCount: number;
  commandsSucceeded: number;
  commandsFailed: number;
  testSignals: { passed: number; failed: number };
  buildSignals: { passed: number; failed: number };
  lintSignals: { passed: number; failed: number };
  installSignals: { passed: number; failed: number };
  runSignals: { passed: number; failed: number };
  toolCalls: ToolSignal[];
  toolResults: ToolSignal[];
  errorMessages: string[];
  strongestFailure?: string;
  strongestSuccess?: string;
  hadToolErrors: boolean;
};

const CODING_KEYWORDS = [
  "bug",
  "error",
  "fix",
  "debug",
  "implement",
  "build",
  "create",
  "refactor",
  "function",
  "class",
  "api",
  "endpoint",
  "database",
  "query",
  "test",
  "deploy",
  "config",
  "install",
  "code",
  "script",
];

const SUCCESS_KEYWORDS = ["fixed", "works", "working", "resolved", "passing", "tests pass", "done"];
const FAILURE_KEYWORDS = ["failed", "still broken", "not working", "error persists", "blocked", "stuck"];

export function shouldCaptureCodingTrace(messages: AgentMessage[]): boolean {
  if (messages.length < 4) {
    return false;
  }
  const combined = messages.map(getMessageText).join(" ").toLowerCase();
  return CODING_KEYWORDS.some((keyword) => combined.includes(keyword));
}

export function buildStructuredTrace(params: {
  sessionId: string;
  messages: AgentMessage[];
  toolsUsed?: string[];
  filesModified?: string[];
  workspaceRoot?: string;
  startTime: number;
  endTime: number;
}): StructuredTracePayload | null {
  if (!shouldCaptureCodingTrace(params.messages)) {
    return null;
  }

  const firstUser = params.messages.find((message) => message.role === "user");
  if (!firstUser) {
    return null;
  }

  const problem = sanitizeCognitiveText(getMessageText(firstUser).slice(0, 600));
  const reasoning = sanitizeCognitiveText(extractReasoning(params.messages));
  if (!problem || reasoning.length < 40) {
    return null;
  }

  const automatedSignals = extractAutomatedSignals(params.messages, params.toolsUsed ?? []);
  const heuristicOutcome = detectHeuristicOutcome(params.messages);
  const automatedOutcome = detectAutomatedOutcome(params.messages, automatedSignals);
  const context = extractContext(params.messages, params.filesModified ?? [], automatedSignals);
  const solution = heuristicOutcome === "success" ? sanitizeCognitiveText(extractLastAssistant(params.messages).slice(0, 1400)) : undefined;
  const durationMs = Math.max(0, params.endTime - params.startTime);
  if (durationMs < 10_000) {
    return null;
  }

  const shareText = [problem, reasoning, solution ?? "", ...(context.errorMessages ?? [])].join("\n");
  const languages = inferLanguages(params.filesModified ?? []);
  const verificationCommands = extractVerificationCommands(automatedSignals.toolResults);
  const retryCount = estimateRetryCount(automatedSignals.toolCalls, automatedSignals.toolResults);
  const resolutionKind = determineResolutionKind(automatedSignals);
  const diffSummary = buildDiffSummary(params.filesModified ?? [], languages);
  return {
    sessionId: params.sessionId,
    type: detectProblemType(params.messages),
    problem,
    context,
    reasoning,
    approaches: summarizeApproaches(reasoning),
    solution: solution || undefined,
    outcome: automatedOutcome === "failed" ? "failed" : heuristicOutcome,
    heuristicOutcome,
    automatedOutcome,
    automatedSignals: {
      ...automatedSignals,
      automatedOutcome: automatedOutcome ?? null,
      errorMessages: context.errorMessages ?? [],
      verificationCommands,
      retryCount,
      resolutionKind,
    },
    errorMessage: context.errorMessages?.[0],
    toolsUsed: automatedSignals.toolsUsed,
    toolCalls: automatedSignals.toolCalls,
    toolResults: automatedSignals.toolResults,
    verificationCommands,
    retryCount,
    repoSignals: {
      filesModified: params.filesModified ?? [],
      languages,
      diffSummary,
      workspaceRoot: params.workspaceRoot,
    },
    resolutionKind,
    filesModified: params.filesModified ?? [],
    durationMs,
    sanitized: true,
    sanitizedAt: new Date().toISOString(),
    shareEligible: isShareEligible(shareText),
  };
}

function inferLanguages(filesModified: string[]): string[] {
  const languages = new Set<string>();
  for (const file of filesModified) {
    const extension = file.split(".").pop()?.toLowerCase();
    if (extension === "ts" || extension === "tsx") languages.add("typescript");
    if (extension === "js" || extension === "jsx") languages.add("javascript");
    if (extension === "py") languages.add("python");
    if (extension === "go") languages.add("go");
    if (extension === "rs") languages.add("rust");
    if (extension === "java") languages.add("java");
    if (extension === "rb") languages.add("ruby");
    if (extension === "sql") languages.add("sql");
    if (extension === "md") languages.add("markdown");
    if (extension === "json") languages.add("json");
    if (extension === "yml" || extension === "yaml") languages.add("yaml");
    if (extension === "sh") languages.add("shell");
  }
  return [...languages];
}

function buildDiffSummary(filesModified: string[], languages: string[]): string {
  if (filesModified.length === 0) {
    return "No file modifications detected";
  }
  const languageSummary = languages.length > 0 ? ` across ${languages.join(", ")}` : "";
  return `${filesModified.length} files modified${languageSummary}`;
}

function extractVerificationCommands(toolResults: ToolSignal[]): string[] {
  return toolResults
    .filter((signal) => signal.success === true && (signal.category === "test" || signal.category === "build" || signal.category === "lint"))
    .map((signal) => signal.command)
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);
}

function estimateRetryCount(toolCalls: ToolSignal[], toolResults: ToolSignal[]): number {
  const commandCounts = new Map<string, number>();
  for (const signal of [...toolCalls, ...toolResults]) {
    const key = signal.command ?? signal.toolName;
    commandCounts.set(key, (commandCounts.get(key) ?? 0) + 1);
  }
  let retries = toolResults.filter((signal) => signal.success === false).length;
  for (const count of commandCounts.values()) {
    if (count > 1) {
      retries += count - 1;
    }
  }
  return retries;
}

function determineResolutionKind(
  automatedSignals: AutomatedSignalSummary,
): "tests_passed" | "build_passed" | "lint_passed" | "manual_only" | "failed" {
  if (automatedSignals.testSignals.passed > 0) {
    return "tests_passed";
  }
  if (automatedSignals.buildSignals.passed > 0) {
    return "build_passed";
  }
  if (automatedSignals.lintSignals.passed > 0) {
    return "lint_passed";
  }
  if (
    automatedSignals.commandsFailed > 0 ||
    automatedSignals.testSignals.failed > 0 ||
    automatedSignals.buildSignals.failed > 0 ||
    automatedSignals.lintSignals.failed > 0
  ) {
    return "failed";
  }
  return "manual_only";
}

function detectProblemType(messages: AgentMessage[]): string {
  const text = messages.map(getMessageText).join(" ").toLowerCase();
  if (/debug|bug|error|fix|broken/.test(text)) return "debugging";
  if (/refactor|cleanup|reorganize/.test(text)) return "refactoring";
  if (/review|audit|inspect/.test(text)) return "reviewing";
  if (/config|setup|install|deploy/.test(text)) return "configuring";
  return "building";
}

function detectHeuristicOutcome(messages: AgentMessage[]): "success" | "partial" | "failed" {
  const recent = messages.slice(-5).map(getMessageText).join(" ").toLowerCase();
  const success = SUCCESS_KEYWORDS.filter((keyword) => recent.includes(keyword)).length;
  const failure = FAILURE_KEYWORDS.filter((keyword) => recent.includes(keyword)).length;
  if (success > failure && success > 0) return "success";
  if (failure > success && failure > 0) return "failed";
  return "partial";
}

function detectAutomatedOutcome(
  messages: AgentMessage[],
  automatedSignals: AutomatedSignalSummary,
): "success" | "failed" | undefined {
  if (
    automatedSignals.commandsFailed > 0 ||
    automatedSignals.testSignals.failed > 0 ||
    automatedSignals.buildSignals.failed > 0 ||
    automatedSignals.lintSignals.failed > 0 ||
    automatedSignals.installSignals.failed > 0
  ) {
    if (
      automatedSignals.commandsSucceeded === 0 &&
      automatedSignals.testSignals.passed === 0 &&
      automatedSignals.buildSignals.passed === 0 &&
      automatedSignals.lintSignals.passed === 0
    ) {
      return "failed";
    }
  }

  if (
    automatedSignals.testSignals.passed > 0 ||
    automatedSignals.buildSignals.passed > 0 ||
    automatedSignals.lintSignals.passed > 0 ||
    (automatedSignals.commandsSucceeded > 0 && automatedSignals.commandsFailed === 0)
  ) {
    if (
      automatedSignals.commandsFailed === 0 &&
      automatedSignals.testSignals.failed === 0 &&
      automatedSignals.buildSignals.failed === 0 &&
      automatedSignals.lintSignals.failed === 0 &&
      automatedSignals.installSignals.failed === 0
    ) {
      return "success";
    }
  }

  const recent = messages.slice(-8).map(getMessageText).join(" ").toLowerCase();
  if (/tests? pass|build succeeded|compiled successfully|all checks passed/.test(recent)) {
    return "success";
  }
  if (/tests? failed|build failed|compilation failed|command failed|exit code [1-9]/.test(recent)) {
    return "failed";
  }
  return undefined;
}

function extractReasoning(messages: AgentMessage[]): string {
  const segments: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    const content = (message as unknown as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block === "object" && block !== null && "thinking" in block && typeof block.thinking === "string") {
          segments.push(block.thinking);
        }
      }
    }
  }

  if (segments.length === 0) {
    return messages
      .filter((message) => message.role === "assistant")
      .map(getMessageText)
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);
  }

  return segments.join("\n\n").slice(0, 4000);
}

function extractContext(
  messages: AgentMessage[],
  filesModified: string[],
  automatedSignals: AutomatedSignalSummary,
): { technologies: string[]; errorMessages?: string[] } {
  const text = messages.map(getMessageText).join(" ");
  const techPatterns: Record<string, RegExp> = {
    typescript: /typescript|\.tsx?|tsc/i,
    javascript: /javascript|\.jsx?|node/i,
    react: /react|jsx|useState|useEffect/i,
    nextjs: /next\.js|app router/i,
    turso: /turso|libsql/i,
    postgres: /postgres|psql|pg_/i,
    python: /python|\.py|pip/i,
    docker: /docker|container/i,
    git: /\bgit\b|commit|branch|merge/i,
  };
  const technologies = Object.entries(techPatterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([technology]) => technology);

  const errorMessages = Array.from(
    text.matchAll(/(?:TypeError|ReferenceError|SyntaxError|Error|Cannot\s+[^\n.]+)/gi),
    (match) => sanitizeCognitiveText(match[0].slice(0, 240)),
  ).slice(0, 5);
  for (const toolError of automatedSignals.errorMessages) {
    if (errorMessages.length >= 5) {
      break;
    }
    if (!errorMessages.includes(toolError)) {
      errorMessages.push(toolError);
    }
  }

  const fileHints = filesModified.filter(Boolean);
  if (fileHints.length > 0 && !technologies.includes("git")) {
    technologies.push("git");
  }

  return {
    technologies,
    errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
  };
}

function extractAutomatedSignals(messages: AgentMessage[], fallbackToolsUsed: string[]): AutomatedSignalSummary {
  const toolsUsed = new Set<string>(fallbackToolsUsed.filter(Boolean));
  const toolUseById = new Map<string, ToolUseReference>();
  const toolCalls: ToolSignal[] = [];
  const toolResults: ToolSignal[] = [];
  const errorMessages: string[] = [];
  let commandsSucceeded = 0;
  let commandsFailed = 0;
  let toolCallCount = 0;
  let toolResultCount = 0;
  const testSignals = { passed: 0, failed: 0 };
  const buildSignals = { passed: 0, failed: 0 };
  const lintSignals = { passed: 0, failed: 0 };
  const installSignals = { passed: 0, failed: 0 };
  const runSignals = { passed: 0, failed: 0 };
  let hadToolErrors = false;

  for (const message of messages) {
    const rawMessage = message as unknown as Record<string, unknown>;
    const messageToolName = readString(rawMessage.toolName) ?? readString(rawMessage.name);
    if (messageToolName) {
      toolsUsed.add(messageToolName);
    }

    if (isToolResultMessage(rawMessage)) {
      toolResultCount += 1;
      const signal = extractToolSignalFromContainer(rawMessage, messageToolName ?? "unknown", toolUseById);
      if (signal) {
        toolResults.push(signal);
        toolsUsed.add(signal.toolName);
        applySignalSummary(signal, {
          testSignals,
          buildSignals,
          lintSignals,
          installSignals,
          runSignals,
          errorMessages,
          onCommandSuccess: () => {
            commandsSucceeded += 1;
          },
          onCommandFailure: () => {
            commandsFailed += 1;
            hadToolErrors = true;
          },
          onToolError: () => {
            hadToolErrors = true;
          },
        });
      }
    }

    const content = rawMessage.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const rawBlock = block as Record<string, unknown>;
      const blockType = readString(rawBlock.type);
      if (blockType === "tool_use") {
        toolCallCount += 1;
        const toolName = readString(rawBlock.name) ?? messageToolName ?? "unknown";
        const command = extractCommandText(rawBlock);
        const toolUseId = readString(rawBlock.id) ?? readString(rawBlock.tool_use_id) ?? readString(rawBlock.toolUseId);
        if (toolUseId) {
          toolUseById.set(toolUseId, { toolName, command });
        }
        toolsUsed.add(toolName);
        toolCalls.push({
          toolName,
          category: classifyToolSignal(toolName, command),
          command,
        });
      }

      if (blockType === "tool_result") {
        toolResultCount += 1;
        const signal = extractToolSignalFromContainer(rawBlock, messageToolName ?? "unknown", toolUseById);
        if (signal) {
          toolResults.push(signal);
          toolsUsed.add(signal.toolName);
          applySignalSummary(signal, {
            testSignals,
            buildSignals,
            lintSignals,
            installSignals,
            runSignals,
            errorMessages,
            onCommandSuccess: () => {
              commandsSucceeded += 1;
            },
            onCommandFailure: () => {
              commandsFailed += 1;
              hadToolErrors = true;
            },
            onToolError: () => {
              hadToolErrors = true;
            },
          });
        }
      }
    }
  }

  return {
    toolsUsed: [...toolsUsed],
    toolCallCount,
    toolResultCount,
    commandsSucceeded,
    commandsFailed,
    testSignals,
    buildSignals,
    lintSignals,
    installSignals,
    runSignals,
    toolCalls: toolCalls.slice(0, 12),
    toolResults: toolResults.slice(0, 12),
    errorMessages: errorMessages.slice(0, 5),
    strongestFailure: errorMessages[0],
    strongestSuccess: summarizeStrongestSuccess(testSignals, buildSignals, lintSignals, installSignals, runSignals),
    hadToolErrors,
  };
}

function isToolResultMessage(raw: Record<string, unknown>): boolean {
  return raw.role === "toolResult" || raw.type === "toolResult" || raw.role === "tool";
}

function extractToolSignalFromContainer(
  raw: Record<string, unknown>,
  fallbackToolName: string,
  toolUseById: Map<string, ToolUseReference>,
): ToolSignal | null {
  const toolUseId = readString(raw.tool_use_id) ?? readString(raw.toolUseId);
  const toolRef = toolUseId ? toolUseById.get(toolUseId) : undefined;
  const toolName =
    readString(raw.toolName) ??
    readString(raw.name) ??
    toolRef?.toolName ??
    fallbackToolName;
  const command = extractCommandText(raw) ?? toolRef?.command;
  const outputText = readTextualPayload(raw.content) || readTextualPayload(raw.output) || readTextualPayload(raw.result);
  const stderrText = readTextualPayload(raw.stderr) || readTextualPayload(raw.error);
  const combinedText = [outputText, stderrText].filter(Boolean).join("\n").trim();
  const exitCode = readNumber(raw.exitCode) ?? readNumber(raw.exit_code);
  const explicitSuccess = readBoolean(raw.success);
  const explicitError = readBoolean(raw.is_error);
  const success = explicitSuccess ?? inferCommandSuccess(exitCode, explicitError, combinedText);

  return {
    toolName,
    category: classifyToolSignal(toolName, command),
    command,
    success,
    exitCode,
    isError: explicitError ?? (success === false),
    outputSnippet: outputText ? sanitizeCognitiveText(outputText.slice(0, 240)) : undefined,
    errorSnippet: stderrText
      ? sanitizeCognitiveText(stderrText.slice(0, 240))
      : inferErrorSnippet(combinedText),
  };
}

function applySignalSummary(
  signal: ToolSignal,
  sinks: {
    testSignals: { passed: number; failed: number };
    buildSignals: { passed: number; failed: number };
    lintSignals: { passed: number; failed: number };
    installSignals: { passed: number; failed: number };
    runSignals: { passed: number; failed: number };
    errorMessages: string[];
    onCommandSuccess: () => void;
    onCommandFailure: () => void;
    onToolError: () => void;
  },
): void {
  if (signal.success === true) {
    sinks.onCommandSuccess();
  }
  if (signal.success === false) {
    sinks.onCommandFailure();
  }
  if (signal.isError) {
    sinks.onToolError();
  }

  if (signal.category === "test") {
    if (signal.success === false) {
      sinks.testSignals.failed += 1;
    } else if (signal.success === true) {
      sinks.testSignals.passed += 1;
    }
  }
  if (signal.category === "build") {
    if (signal.success === false) {
      sinks.buildSignals.failed += 1;
    } else if (signal.success === true) {
      sinks.buildSignals.passed += 1;
    }
  }
  if (signal.category === "lint") {
    if (signal.success === false) {
      sinks.lintSignals.failed += 1;
    } else if (signal.success === true) {
      sinks.lintSignals.passed += 1;
    }
  }
  if (signal.category === "install") {
    if (signal.success === false) {
      sinks.installSignals.failed += 1;
    } else if (signal.success === true) {
      sinks.installSignals.passed += 1;
    }
  }
  if (signal.category === "run") {
    if (signal.success === false) {
      sinks.runSignals.failed += 1;
    } else if (signal.success === true) {
      sinks.runSignals.passed += 1;
    }
  }

  const errorSnippet = signal.errorSnippet || inferErrorSnippet(signal.outputSnippet ?? "");
  if (errorSnippet && !sinks.errorMessages.includes(errorSnippet) && sinks.errorMessages.length < 5) {
    sinks.errorMessages.push(errorSnippet);
  }
}

function summarizeStrongestSuccess(
  testSignals: { passed: number; failed: number },
  buildSignals: { passed: number; failed: number },
  lintSignals: { passed: number; failed: number },
  installSignals: { passed: number; failed: number },
  runSignals: { passed: number; failed: number },
): string | undefined {
  if (testSignals.passed > 0) {
    return "Tests passed";
  }
  if (buildSignals.passed > 0) {
    return "Build succeeded";
  }
  if (lintSignals.passed > 0) {
    return "Lint/checks passed";
  }
  if (installSignals.passed > 0) {
    return "Dependencies installed successfully";
  }
  if (runSignals.passed > 0) {
    return "Command completed successfully";
  }
  return undefined;
}

function classifyToolSignal(toolName: string, command?: string): ToolSignalCategory {
  const text = `${toolName} ${command ?? ""}`.toLowerCase();
  if (/test|jest|vitest|pytest|go test|cargo test|npm test|pnpm test|bun test/.test(text)) return "test";
  if (/build|compile|tsc|next build|vite build|cargo build/.test(text)) return "build";
  if (/lint|eslint|ruff|check|tsc --noemit/.test(text)) return "lint";
  if (/install|npm i|npm install|pnpm install|yarn install|pip install|brew install/.test(text)) return "install";
  if (/edit|write|apply_patch|create file|replace/.test(text)) return "edit";
  if (/search|rg|grep|find|ls|cat|sed/.test(text)) return "search";
  if (/run|node |python |bash |sh |zsh |npm run|pnpm |yarn /.test(text)) return "run";
  return "unknown";
}

function extractCommandText(raw: Record<string, unknown>): string | undefined {
  const direct =
    readString(raw.command) ??
    readString(raw.cmd) ??
    readString(raw.input);
  if (direct) {
    return sanitizeCognitiveText(direct.slice(0, 240));
  }

  const input = raw.input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const command =
      readString((input as Record<string, unknown>).command) ??
      readString((input as Record<string, unknown>).cmd) ??
      readString((input as Record<string, unknown>).shell_command);
    if (command) {
      return sanitizeCognitiveText(command.slice(0, 240));
    }
  }
  return undefined;
}

function inferCommandSuccess(
  exitCode: number | undefined,
  explicitError: boolean | undefined,
  text: string,
): boolean | undefined {
  if (typeof explicitError === "boolean") {
    return !explicitError;
  }
  if (typeof exitCode === "number") {
    return exitCode === 0;
  }

  const lower = text.toLowerCase();
  if (/all checks passed|tests? pass|build succeeded|compiled successfully|done in [\d.]+s/.test(lower)) {
    return true;
  }
  if (/tests? failed|build failed|compilation failed|command failed|error:|exit code [1-9]/.test(lower)) {
    return false;
  }
  return undefined;
}

function inferErrorSnippet(text: string): string | undefined {
  if (!text) {
    return undefined;
  }
  const match = text.match(/(?:TypeError|ReferenceError|SyntaxError|Error|Cannot\s+[^\n.]+|Failed[^\n.]*)/i);
  if (!match) {
    return undefined;
  }
  return sanitizeCognitiveText(match[0].slice(0, 240));
}

function readTextualPayload(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object") {
          return (
            readString((entry as Record<string, unknown>).text) ??
            readString((entry as Record<string, unknown>).content) ??
            readString((entry as Record<string, unknown>).output) ??
            ""
          );
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return (
      readString((value as Record<string, unknown>).text) ??
      readString((value as Record<string, unknown>).content) ??
      readString((value as Record<string, unknown>).output) ??
      readString((value as Record<string, unknown>).stderr) ??
      readString((value as Record<string, unknown>).stdout) ??
      ""
    );
  }
  return "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function summarizeApproaches(reasoning: string): Array<{ description: string; result: "worked" | "failed" | "partial"; learnings?: string }> {
  const parts = reasoning
    .split(/\n+|\. /)
    .map((part) => part.trim())
    .filter((part) => part.length > 20)
    .slice(0, 4);

  return parts.map((part, index) => ({
    description: part,
    result: index === parts.length - 1 ? "worked" : "partial",
    learnings: part.length > 140 ? part.slice(0, 140) : undefined,
  }));
}

function extractLastAssistant(messages: AgentMessage[]): string {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  return assistant ? getMessageText(assistant) : "";
}

export function getMessageText(message: AgentMessage): string {
  const content = (message as unknown as { content?: unknown; text?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  const text = (message as unknown as { text?: unknown }).text;
  if (typeof text === "string") {
    return text;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }
        if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
          return block.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
