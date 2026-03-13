/**
 * Constraint Templates API
 * 
 * GET /api/v1/cognitive/constraints/templates - List available templates
 * POST /api/v1/cognitive/constraints/templates - Apply a template
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { CONSTRAINT_TEMPLATES, applyTemplate, GLOBAL_CONSTRAINTS } from "@/lib/constraints-db";

export const runtime = "nodejs";

/**
 * GET /api/v1/cognitive/constraints/templates
 * List available constraint templates
 */
export async function GET(request: Request) {
  try {
    await validateApiKey(request, "cognitive.constraints.templates.list");
    
    return Response.json({
      templates: CONSTRAINT_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        constraintCount: t.constraints.length,
        constraints: t.constraints.map(c => ({
          rule: c.rule,
          severity: c.severity,
        })),
      })),
      globalDefaults: GLOBAL_CONSTRAINTS.map(c => ({
        rule: c.rule,
        severity: c.severity,
      })),
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/v1/cognitive/constraints/templates
 * Apply a template to the user's constraints
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "cognitive.constraints.templates.apply");
    const body = await request.json();
    
    const templateId = typeof body.templateId === "string" ? body.templateId : "";
    
    if (!templateId) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "templateId", reason: "required" });
    }
    
    const template = CONSTRAINT_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "templateId", 
        reason: `Template not found. Available: ${CONSTRAINT_TEMPLATES.map(t => t.id).join(", ")}` 
      });
    }
    
    const created = await applyTemplate(identity.userId, templateId);
    
    return Response.json({
      applied: true,
      templateId,
      templateName: template.name,
      constraintsCreated: created.length,
      constraints: created.map(c => ({
        id: c.id,
        rule: c.rule,
        severity: c.severity,
      })),
    }, { status: 201 });
    
  } catch (error) {
    return errorResponse(error);
  }
}
