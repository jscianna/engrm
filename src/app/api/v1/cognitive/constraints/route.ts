/**
 * Constraints API
 * 
 * GET /api/v1/cognitive/constraints - List active constraints
 * POST /api/v1/cognitive/constraints - Create constraint (or auto-detect)
 */

import { validateApiKey } from "@/lib/api-auth";
import { MemryError, errorResponse } from "@/lib/errors";
import { 
  createConstraint, 
  getActiveConstraints, 
  checkConstraintExists 
} from "@/lib/constraints-db";

export const runtime = "nodejs";

import { CONSTRAINT_PATTERNS, TRIGGER_KEYWORDS } from "@/lib/constraint-patterns";

/**
 * GET /api/v1/cognitive/constraints
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.constraints.list");
    
    const constraints = await getActiveConstraints(identity.userId);
    
    // Format for context injection
    const critical = constraints.filter(c => c.severity === 'critical');
    const warnings = constraints.filter(c => c.severity === 'warning');
    
    let contextFormat = '';
    if (constraints.length > 0) {
      contextFormat = '## Active Constraints\n';
      if (critical.length > 0) {
        contextFormat += '⚠️ **Critical:**\n';
        contextFormat += critical.map(c => `• ${c.rule}`).join('\n') + '\n';
      }
      if (warnings.length > 0) {
        contextFormat += '**Warnings:**\n';
        contextFormat += warnings.map(c => `• ${c.rule}`).join('\n') + '\n';
      }
    }
    
    return Response.json({
      constraints: constraints.map(c => ({
        id: c.id,
        rule: c.rule,
        triggers: JSON.parse(c.triggersJson),
        severity: c.severity,
        createdAt: c.createdAt,
      })),
      count: constraints.length,
      contextFormat,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/v1/cognitive/constraints
 * 
 * Two modes:
 * 1. Explicit: { rule, triggers, severity }
 * 2. Auto-detect: { message } - will parse and extract constraint
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.constraints.create");
    const body = await request.json();
    
    // Mode 1: Auto-detect from message
    if (body.message && typeof body.message === 'string') {
      const detected = detectConstraint(body.message);
      
      if (!detected.isConstraint) {
        return Response.json({
          detected: false,
          message: "No constraint pattern detected in message",
        });
      }
      
      // Check if similar constraint already exists
      const exists = await checkConstraintExists(identity.userId, detected.rule!);
      if (exists) {
        return Response.json({
          detected: true,
          alreadyExists: true,
          rule: detected.rule,
        });
      }
      
      const constraint = await createConstraint({
        userId: identity.userId,
        rule: detected.rule!,
        triggers: detected.triggers!,
        severity: detected.severity!,
        source: body.message.slice(0, 500),
      });
      
      return Response.json({
        detected: true,
        constraint: {
          id: constraint.id,
          rule: constraint.rule,
          triggers: JSON.parse(constraint.triggersJson),
          severity: constraint.severity,
        },
      }, { status: 201 });
    }
    
    // Mode 2: Explicit constraint
    if (!body.rule) {
      throw new MemryError("VALIDATION_ERROR", { field: "rule", reason: "required" });
    }
    
    const rule = String(body.rule).trim();
    const triggers = Array.isArray(body.triggers) ? body.triggers : [];
    const severity = body.severity === 'critical' ? 'critical' : 'warning';
    
    // Check if similar constraint already exists
    const exists = await checkConstraintExists(identity.userId, rule);
    if (exists) {
      return Response.json({
        alreadyExists: true,
        rule,
      });
    }
    
    const constraint = await createConstraint({
      userId: identity.userId,
      rule,
      triggers,
      severity,
      source: body.source || 'manual',
    });
    
    return Response.json({
      constraint: {
        id: constraint.id,
        rule: constraint.rule,
        triggers: JSON.parse(constraint.triggersJson),
        severity: constraint.severity,
      },
    }, { status: 201 });
    
  } catch (error) {
    return errorResponse(error);
  }
}

// Helper: Detect constraint from message using MoA-generated patterns
function detectConstraint(message: string): {
  isConstraint: boolean;
  rule?: string;
  triggers?: string[];
  severity?: 'critical' | 'warning';
  category?: string;
} {
  for (const { pattern, category, severity } of CONSTRAINT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    
    if (pattern.test(message)) {
      // Find the matching sentence
      const sentences = message.split(/[.!?\n]+/).filter(s => s.trim());
      pattern.lastIndex = 0;
      const matchingSentence = sentences.find(s => {
        pattern.lastIndex = 0;
        return pattern.test(s);
      });
      
      if (matchingSentence) {
        const rule = matchingSentence.trim();
        const triggers = extractTriggers(message.toLowerCase());
        
        return { 
          isConstraint: true, 
          rule, 
          triggers, 
          severity,
          category,
        };
      }
    }
  }
  
  return { isConstraint: false };
}

function extractTriggers(message: string): string[] {
  const triggers: string[] = [];
  
  for (const [category, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (message.includes(keyword)) {
        triggers.push(keyword);
        if (!triggers.includes(category)) {
          triggers.push(category);
        }
      }
    }
  }
  
  return [...new Set(triggers)];
}
