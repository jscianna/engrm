"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertAdminViewer } from "@/lib/admin-auth";
import { deliverOperationalAlerts } from "@/lib/alert-delivery";
import { extractRequestInfo, logAuditEvent } from "@/lib/audit-log";
import { backfillApiKeyScopes } from "@/lib/db";
import { getOperationalAlertsSummary } from "@/lib/operational-alerts";

function buildRedirect(target: string, key: "notice" | "error", value: string): never {
  const searchParams = new URLSearchParams({ [key]: value });
  redirect(`${target}?${searchParams.toString()}`);
}

export async function sendOperationalAlertTestAction(): Promise<void> {
  const identity = await assertAdminViewer();
  try {
    const summary = await getOperationalAlertsSummary();
    const result = await deliverOperationalAlerts(summary, {
      force: true,
      reason: "dashboard admin smoke test",
      source: "dashboard_admin",
    });
    await logAuditEvent({
      userId: identity.userId ?? identity.email ?? "__admin__",
      action: "admin.maintenance",
      resourceType: "operational_alerts",
      resourceId: "delivery",
      metadata: {
        force: true,
        source: "dashboard_admin",
        delivered: result.delivered,
        skipped: result.skipped,
        alertCount: result.alertCount,
        format: result.format,
        responseStatus: result.responseStatus ?? null,
      },
      ...extractRequestInfo(new Request("https://dashboard.local/admin")),
    });
    revalidatePath("/dashboard/admin");
    buildRedirect("/dashboard/admin", "notice", "Operational alert smoke test sent.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send operational alert smoke test.";
    buildRedirect("/dashboard/admin", "error", message);
  }
}

export async function applyApiKeyBackfillAction(): Promise<void> {
  const identity = await assertAdminViewer();
  try {
    const result = await backfillApiKeyScopes({
      dryRun: false,
    });
    await logAuditEvent({
      userId: identity.userId ?? identity.email ?? "__admin__",
      action: "admin.migrate",
      resourceType: "api_keys",
      resourceId: "all",
      metadata: {
        source: "dashboard_admin",
        updated: result.updated,
        candidates: result.candidates,
        appliedScopes: result.appliedScopes,
      },
      ...extractRequestInfo(new Request("https://dashboard.local/admin")),
    });
    revalidatePath("/dashboard/admin");
    buildRedirect("/dashboard/admin", "notice", `API key scope backfill applied to ${result.updated} key(s).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to backfill API key scopes.";
    buildRedirect("/dashboard/admin", "error", message);
  }
}
