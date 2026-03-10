const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{20,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /(['"]?)(?:api[_-]?key|secret|password|token)(['"]?\s*[:=]\s*)(['"]?)[^\s'"]+\3/gi,
];

export function sanitizeCognitiveText(text: string): string {
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export function isShareEligible(text: string): boolean {
  return !SECRET_PATTERNS.some((pattern) => pattern.test(text));
}
