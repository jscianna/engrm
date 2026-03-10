import { extractRequestInfo, logAuditEvent, type AuditAction } from "@/lib/audit-log";

export async function logCognitiveAuditEvent(params: {
  request: Request;
  userId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(params.request);
  await logAuditEvent({
    userId: params.userId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    ipAddress,
    userAgent,
    metadata: params.metadata,
  });
}
