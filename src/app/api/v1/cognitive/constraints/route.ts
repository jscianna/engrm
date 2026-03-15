/**
 * Constraints API
 * 
 * GET /api/v1/cognitive/constraints - List active constraints
 * POST /api/v1/cognitive/constraints - Create constraint (or auto-detect)
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { 
  createConstraint, 
  getActiveConstraints, 
  checkConstraintExists 
} from "@/lib/constraints-db";
import { detectConstraint } from "@/lib/constraint-detection";

export const runtime = "nodejs";

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
      throw new FatHippoError("VALIDATION_ERROR", { field: "rule", reason: "required" });
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
