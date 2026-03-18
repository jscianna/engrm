/**
 * Auto-Scoped Recall: Project Context Detection
 *
 * Detects project context from signals in the request to scope/boost recall.
 * Signals (priority order): explicit namespace, session metadata, content hints.
 */

export type ProjectScope = {
  detected: boolean;
  scope: string | null;
  confidence: number;
  source: "namespace" | "session_meta" | "content_hint" | "none";
};

/**
 * Extract a project name from a file path.
 * Handles common patterns like ~/projects/foo, /Users/x/code/bar, /home/x/repos/baz.
 */
function extractProjectFromPath(filepath: string): string | null {
  // Match common project directory patterns
  const patterns = [
    /\/(?:projects|repos|code|src|workspace|workspaces|dev)\/([^/]+)/i,
    /\/home\/[^/]+\/([^/]+)/,
    /\/Users\/[^/]+\/(?:Documents\/|Desktop\/)?([^/]+)/,
  ];

  for (const pattern of patterns) {
    const match = filepath.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract a project name from a git repo URL.
 * Handles github.com/user/repo, gitlab.com/user/repo, etc.
 */
function extractProjectFromRepo(repo: string): string | null {
  // Match repo patterns like github.com/user/repo
  const match = repo.match(/(?:github|gitlab|bitbucket)\.(?:com|org)\/[^/]+\/([^/.]+)/);
  if (match?.[1]) {
    return match[1];
  }

  // Plain repo reference
  const simpleMatch = repo.match(/^([a-zA-Z0-9_-]+)$/);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }

  return null;
}

/**
 * Scan message text for project/path references.
 */
function extractProjectFromContent(text: string): string | null {
  // Path references in message
  const pathPatterns = [
    /~\/(?:projects|repos|code)\/([a-zA-Z0-9_-]+)/,
    /(?:src|lib|app)\/([a-zA-Z0-9_-]+)\//,
    /\bthe\s+([a-zA-Z0-9_-]+)\s+(?:repo|repository|project|codebase)\b/i,
    /\b(?:in|for)\s+([a-zA-Z0-9_-]+)\s+(?:repo|repository|project)\b/i,
  ];

  for (const pattern of pathPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function detectProjectScope(opts: {
  namespace?: string;
  sessionMeta?: Record<string, unknown>;
  messageText: string;
}): ProjectScope {
  // Priority 1: Explicit namespace
  if (opts.namespace) {
    return {
      detected: true,
      scope: opts.namespace,
      confidence: 1.0,
      source: "namespace",
    };
  }

  // Priority 2: Session metadata (cwd, repo)
  if (opts.sessionMeta) {
    const cwd = typeof opts.sessionMeta.cwd === "string" ? opts.sessionMeta.cwd : null;
    const repo = typeof opts.sessionMeta.repo === "string" ? opts.sessionMeta.repo : null;

    if (repo) {
      const project = extractProjectFromRepo(repo);
      if (project) {
        return {
          detected: true,
          scope: project,
          confidence: 0.9,
          source: "session_meta",
        };
      }
    }

    if (cwd) {
      const project = extractProjectFromPath(cwd);
      if (project) {
        return {
          detected: true,
          scope: project,
          confidence: 0.9,
          source: "session_meta",
        };
      }
    }
  }

  // Priority 3: Content hints in the message
  const contentProject = extractProjectFromContent(opts.messageText);
  if (contentProject) {
    return {
      detected: true,
      scope: contentProject,
      confidence: 0.6,
      source: "content_hint",
    };
  }

  return {
    detected: false,
    scope: null,
    confidence: 0,
    source: "none",
  };
}
