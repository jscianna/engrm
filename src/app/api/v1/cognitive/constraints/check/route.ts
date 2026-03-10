/**
 * Constraint Check API
 * 
 * POST /api/v1/cognitive/constraints/check - Check if an action violates constraints
 * 
 * Smart matching: considers context to avoid false positives
 * e.g., "don't push to public repos" won't trigger on private repo pushes
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { getActiveConstraints } from "@/lib/constraints-db";

export const runtime = "nodejs";

interface CheckResult {
  allowed: boolean;
  violated: Array<{
    id: string;
    rule: string;
    severity: string;
  }>;
  warnings: Array<{
    id: string;
    rule: string;
  }>;
}

// Context keywords that negate certain constraints
const CONTEXT_NEGATIONS: Record<string, string[]> = {
  // If action mentions "private", don't trigger "public" constraints
  'private': ['public'],
  'internal': ['public', 'external'],
  'staging': ['production', 'prod'],
  'dev': ['production', 'prod'],
  'development': ['production', 'prod'],
  'test': ['production', 'prod'],
  'local': ['public', 'external', 'production'],
  'draft': ['publish', 'release'],
  'wip': ['publish', 'release'],
};

// Words in constraint that, if present in context with negation, skip the constraint
const CONSTRAINT_QUALIFIERS = [
  'public',
  'production',
  'prod',
  'external',
  'release',
  'publish',
];

/**
 * POST /api/v1/cognitive/constraints/check
 * Check if an action violates any active constraints
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.constraints.check");
    const body = await request.json();
    
    const action = typeof body.action === "string" ? body.action.toLowerCase() : "";
    const context = typeof body.context === "string" ? body.context.toLowerCase() : "";
    
    if (!action) {
      throw new MemryError("VALIDATION_ERROR", { field: "action", reason: "required" });
    }
    
    const constraints = await getActiveConstraints(identity.userId);
    const result: CheckResult = {
      allowed: true,
      violated: [],
      warnings: [],
    };
    
    const fullContext = `${action} ${context}`.toLowerCase();
    
    for (const constraint of constraints) {
      const triggers = JSON.parse(constraint.triggersJson) as string[];
      const rule = constraint.rule.toLowerCase();
      
      // Check if any trigger matches the action
      const triggerMatches = triggers.some(t => action.includes(t.toLowerCase()));
      
      if (!triggerMatches) continue;
      
      // Smart matching: check if context negates the constraint
      if (shouldSkipConstraint(rule, fullContext)) {
        continue;
      }
      
      // Constraint applies
      if (constraint.severity === 'critical') {
        result.violated.push({
          id: constraint.id,
          rule: constraint.rule,
          severity: constraint.severity,
        });
        result.allowed = false;
      } else {
        result.warnings.push({
          id: constraint.id,
          rule: constraint.rule,
        });
      }
    }
    
    return Response.json(result);
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Smart matching: determine if context negates the constraint
 * 
 * Example: 
 * - Constraint: "don't push to public repos"
 * - Action: "git push"
 * - Context: "private repo"
 * - Result: skip constraint (private negates public)
 */
function shouldSkipConstraint(rule: string, context: string): boolean {
  // Check each context negation
  for (const [contextWord, negatedWords] of Object.entries(CONTEXT_NEGATIONS)) {
    // If context contains the negating word
    if (context.includes(contextWord)) {
      // And the constraint rule contains a word that gets negated
      for (const negated of negatedWords) {
        if (rule.includes(negated) && CONSTRAINT_QUALIFIERS.includes(negated)) {
          // The context negates the constraint
          return true;
        }
      }
    }
  }
  
  return false;
}
