/**
 * Constraint Detection Patterns
 * 
 * Generated via MoA (Claude + Gemini synthesis) for comprehensive coverage.
 * These patterns detect implicit and explicit constraints in natural language.
 */

export interface ConstraintPattern {
  pattern: RegExp;
  category: string;
  severity: 'critical' | 'warning';
}

export const CONSTRAINT_PATTERNS: ConstraintPattern[] = [
  // === EXPLICIT PROHIBITIONS ===
  { pattern: /\b(?:don't|dont|do not|never|must not|mustn't|mustnt|cannot|can't|cant|should not|shouldn't|shouldnt|avoid|refrain from|prohibit|forbidden|ban|block)\b.*\b(?:push|deploy|commit|share|send|upload|publish|release|expose|show|reveal)\b/i, category: "explicit_prohibition", severity: "critical" },
  { pattern: /\b(?:never|don't|dont|do not|must not|mustn't|mustnt)\s+(?:ever\s+)?(?:make|let|allow|permit|enable)\b.*\b(?:public|visible|accessible|available)\b/i, category: "explicit_prohibition", severity: "critical" },
  { pattern: /\b(?:strictly\s+)?(?:no|not|never|don't|dont|do not)\s+(?:external|outside|third.?party|public)\s+(?:access|sharing|distribution|exposure)/i, category: "explicit_prohibition", severity: "critical" },
  { pattern: /\b(?:don't|dont|do not|never)\s+(?:let|allow|make)\s+(?:this|that|it|them)\s+(?:get\s+)?(?:out|public|external)/i, category: "explicit_prohibition", severity: "critical" },
  { pattern: /\b(?:no(?:t allowed)? (?:public|external|unauthorized|unrestricted) (?:access|sharing|disclosure|upload|push|modification|use|distribution))\b/i, category: "explicit_prohibition", severity: "critical" },
  { pattern: /\b(?:strict(?:ly)? (?:prohibited|forbidden|restricted|controlled))\b/i, category: "explicit_prohibition", severity: "critical" },
  
  // === PRIVACY & SECRECY ===
  { pattern: /\b(?:keep|make|ensure)\s+(?:this|that|it|everything)?\s*(?:private|confidential|secret|internal|secure|protected|hidden)/i, category: "privacy", severity: "critical" },
  { pattern: /\b(?:private|confidential|secret|classified|sensitive|proprietary)\s+(?:data|information|code|content|material|details)/i, category: "privacy", severity: "critical" },
  { pattern: /\b(?:this|that|these|those)\s+(?:is|are|must be|should be|needs to be|has to be)\s+(?:private|confidential|secret|internal only|restricted)/i, category: "privacy", severity: "critical" },
  { pattern: /\b(?:maintain|preserve|ensure|keep)\s+(?:privacy|confidentiality|secrecy|security)/i, category: "privacy", severity: "warning" },
  { pattern: /\bno\s+(?:public|external|outside)\s+(?:visibility|access|exposure|sharing)/i, category: "privacy", severity: "critical" },
  { pattern: /\b(?:ensure (?:no losses|no data leaks|no breaches|no exposure))\b/i, category: "privacy", severity: "critical" },
  { pattern: /\b(?:non-disclosure(?: agreement)?|NDA)\b/i, category: "privacy", severity: "critical" },
  { pattern: /\b(?:personal|personally\s+identifiable)\s+(?:information|data)\b/i, category: "privacy", severity: "critical" },
  
  // === APPROVAL REQUIREMENTS ===
  { pattern: /\b(?:ask|check|confirm|verify|get approval)\s+(?:first|before|prior to)\b.*\b(?:push|deploy|commit|share|send|publish|release)/i, category: "approval_required", severity: "warning" },
  { pattern: /\b(?:need|needs|require|requires)\s+(?:approval|permission|authorization|clearance|sign.?off)\s+(?:before|to|for)/i, category: "approval_required", severity: "warning" },
  { pattern: /\b(?:must|should|need to|have to)\s+(?:ask|check|confirm|verify|get permission)\s+(?:first|before)/i, category: "approval_required", severity: "warning" },
  { pattern: /\b(?:run\s+(?:it\s+)?by|check\s+with|confirm\s+with|ask)\s+(?:me|us|team|manager|lead|boss)\s+(?:first|before)/i, category: "approval_required", severity: "warning" },
  { pattern: /\brequires\s+(?:manager|supervisor|team lead|approval)\s+(?:approval|sign.?off|permission)/i, category: "approval_required", severity: "warning" },
  { pattern: /\b(?:without (?:express)? (?:permission|authorization|consent|approval))\b/i, category: "approval_required", severity: "critical" },
  { pattern: /\b(?:vendor|third.?party)\s+(?:approval|clearance)\s+(?:required|needed)/i, category: "approval_required", severity: "warning" },
  { pattern: /\b(?:regulatory|compliance)\s+(?:approval|review|clearance)/i, category: "approval_required", severity: "critical" },
  
  // === IP & PROPRIETARY CONCERNS ===
  { pattern: /\b(?:proprietary|intellectual property|ip|trade secret|patent|copyright|trademark)\s+(?:concerns|issues|restrictions|limitations)/i, category: "ip_proprietary", severity: "critical" },
  { pattern: /\b(?:our|company's?|organization's?)\s+(?:ip|intellectual property|proprietary|trade secrets?)/i, category: "ip_proprietary", severity: "critical" },
  { pattern: /\b(?:licensed|copyrighted|patented|trademarked)\s+(?:material|content|code|software)/i, category: "ip_proprietary", severity: "critical" },
  { pattern: /\b(?:protect|safeguard|preserve)\s+(?:our\s+)?(?:ip|intellectual property|proprietary information|trade secrets?)/i, category: "ip_proprietary", severity: "critical" },
  { pattern: /\b(?:can't|cannot|shouldn't|should not)\s+(?:let\s+)?(?:competitors?|rivals?)\s+(?:see|know|find out|discover)/i, category: "ip_proprietary", severity: "critical" },
  { pattern: /\b(?:not for (?:sale|resale)|copyrighted material)\b/i, category: "ip_proprietary", severity: "critical" },
  { pattern: /\b(?:white\s+label|unbranded|no\s+attribution)\b/i, category: "ip_proprietary", severity: "warning" },
  { pattern: /\b(?:clean\s+room|reverse\s+engineer)\s+(?:implementation|development)/i, category: "ip_proprietary", severity: "critical" },
  
  // === ACCESS CONTROL ===
  { pattern: /\bonly\s+(?:team|internal|authorized|specific)\s+(?:members?|people|users?|personnel)\s+(?:can|should|may|allowed to)\s+(?:see|access|view)/i, category: "access_control", severity: "critical" },
  { pattern: /\b(?:restricted|limited)\s+(?:access|visibility)\s+(?:to|for)\s+(?:team|internal|authorized)\s+(?:only|members?)/i, category: "access_control", severity: "critical" },
  { pattern: /\b(?:internal|team)\s+(?:only|exclusive|restricted)/i, category: "access_control", severity: "warning" },
  { pattern: /\b(?:not for|no)\s+(?:external|outside|public|general)\s+(?:consumption|access|viewing|sharing)/i, category: "access_control", severity: "critical" },
  { pattern: /\b(?:need to know|authorized personnel|cleared individuals?)\s+(?:only|basis)/i, category: "access_control", severity: "critical" },
  { pattern: /\b(?:firewall|air\s+gap|isolated|sandboxed)\s+(?:environment|system|network)/i, category: "access_control", severity: "critical" },
  { pattern: /\b(?:security\s+clearance|background\s+check)\s+(?:required|needed)/i, category: "access_control", severity: "critical" },
  
  // === TIMING CONSTRAINTS ===
  { pattern: /\b(?:not yet|don't.*yet|not ready|wait until|hold off|delay|postpone)\b.*\b(?:push|deploy|commit|share|send|publish|release)/i, category: "timing_constraint", severity: "warning" },
  { pattern: /\b(?:after|until|when|once)\s+(?:we|i|team)\s+(?:finish|complete|review|test|approve)/i, category: "timing_constraint", severity: "warning" },
  { pattern: /\b(?:too early|premature|not the right time|wait for|hold until)/i, category: "timing_constraint", severity: "warning" },
  { pattern: /\b(?:embargo|embargoed)\s+(?:until|till)\b/i, category: "timing_constraint", severity: "critical" },
  { pattern: /\b(?:pre.?release|beta|alpha|prototype|experimental)\s+(?:version|build|code)/i, category: "timing_constraint", severity: "warning" },
  { pattern: /\b(?:embargo|blackout|media\s+silence)\s+(?:period|window)/i, category: "timing_constraint", severity: "critical" },
  { pattern: /\b(?:milestone|deadline|target\s+date)\s+(?:not\s+)?(?:met|reached|achieved)/i, category: "timing_constraint", severity: "warning" },
  
  // === QUALITY GATES ===
  { pattern: /\b(?:must|need to|have to|should|requires?)\s+(?:test|review|check|validate|verify)\s+(?:first|before|prior to)/i, category: "quality_gate", severity: "warning" },
  { pattern: /\b(?:needs?|requires?)\s+(?:code\s+)?(?:review|testing|validation|verification|approval)/i, category: "quality_gate", severity: "warning" },
  { pattern: /\b(?:not tested|untested|unreviewed|not reviewed|needs qa|requires testing)/i, category: "quality_gate", severity: "warning" },
  { pattern: /\b(?:must pass|need to pass|requires)\s+(?:tests?|qa|review|validation)/i, category: "quality_gate", severity: "warning" },
  { pattern: /\bno\s+(?:direct|immediate)\s+(?:push|deploy|commit)\s+(?:to|into)\s+(?:prod|production|main|master)/i, category: "quality_gate", severity: "critical" },
  { pattern: /\b(?:work\s+in\s+progress|wip|draft|preliminary|rough)\s+(?:version|draft|code)/i, category: "quality_gate", severity: "warning" },
  
  // === IMPLICIT CONSTRAINTS ===
  { pattern: /\b(?:competitive\s+advantage|market\s+edge|business\s+advantage|strategic\s+value)/i, category: "implicit_constraint", severity: "warning" },
  { pattern: /\b(?:sensitive|delicate|touchy|critical|important)\s+(?:information|data|material|content|details)/i, category: "implicit_constraint", severity: "warning" },
  { pattern: /\b(?:under\s+wraps|keep\s+quiet|hush.?hush|between\s+us|just\s+between)/i, category: "implicit_constraint", severity: "critical" },
  { pattern: /\b(?:not for|shouldn't)\s+(?:public|external|outside)\s+(?:eyes|consumption|viewing)/i, category: "implicit_constraint", severity: "critical" },
  { pattern: /\b(?:nda|non.?disclosure|confidentiality\s+agreement)\s+(?:applies|covers|protects)/i, category: "implicit_constraint", severity: "critical" },
  { pattern: /\b(?:stealth|under\s+the\s+radar|quiet|low\s+profile)\s+(?:mode|operation|project)/i, category: "implicit_constraint", severity: "warning" },
  { pattern: /\b(?:insider|internal)\s+(?:information|knowledge|details)/i, category: "implicit_constraint", severity: "warning" },
  { pattern: /\b(?:attorney.?client|legal)\s+(?:privilege|protection|confidentiality)/i, category: "implicit_constraint", severity: "critical" },
  { pattern: /\b(?:classified|top\s+secret|eyes\s+only)\b/i, category: "implicit_constraint", severity: "critical" },
  
  // === COMPLIANCE & REGULATORY ===
  { pattern: /\b(?:highly sensitive|critical (?:data|information|system)|vulnerable|at risk|security concern|compliance (?:issue|requirement))\b/i, category: "compliance", severity: "critical" },
  { pattern: /\b(?:personal data|PII|GDPR|HIPAA|CCPA|PCI DSS)\b/i, category: "compliance", severity: "critical" },
  { pattern: /\b(?:regulatory (?:compliance|requirements?)|legal obligation|auditing?)\b/i, category: "compliance", severity: "critical" },
  { pattern: /\b(?:client data|customer information|user data)\b/i, category: "compliance", severity: "critical" },
  { pattern: /\b(?:potential (?:issue|risk|breach))\b/i, category: "compliance", severity: "warning" },
];

/**
 * Trigger keywords by category - used to match actions against constraints
 */
export const TRIGGER_KEYWORDS: Record<string, string[]> = {
  'git': ['push', 'commit', 'merge', 'github', 'repo', 'repository', 'branch', 'pr', 'pull request'],
  'sharing': ['share', 'publish', 'post', 'send', 'upload', 'expose', 'release', 'distribute', 'broadcast'],
  'privacy': ['private', 'secret', 'confidential', 'internal', 'secure', 'protected', 'hidden', 'classified'],
  'code': ['code', 'source', 'algorithm', 'implementation', 'logic', 'function', 'module', 'package'],
  'data': ['data', 'database', 'api', 'key', 'token', 'secret', 'credential', 'password', 'pii'],
  'deploy': ['deploy', 'production', 'prod', 'release', 'launch', 'ship', 'go live'],
  'external': ['public', 'external', 'outside', 'third-party', 'vendor', 'customer', 'client'],
};
