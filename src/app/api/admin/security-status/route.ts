/**
 * Security Status Dashboard API
 * 
 * Returns current security configuration and compliance status.
 * Admin-only endpoint.
 */

import { NextResponse } from "next/server";
import { getQdrantStatus } from "@/lib/qdrant";
import { assertAdminAccess } from "@/lib/admin-auth";
import { getOperationalAlertDeliveryConfig } from "@/lib/alert-delivery";
import { getApiKeyScopeMigrationStatus } from "@/lib/db";
import { getOperationalAlertsSummary } from "@/lib/operational-alerts";
import { buildThrottleActorKey, enforceRequestThrottle } from "@/lib/request-throttle";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let identity;
  try {
    identity = await assertAdminAccess(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await enforceRequestThrottle({
      scope: "admin.security-status.read",
      actorKey: buildThrottleActorKey({
        actorKey: identity.userId ?? identity.email,
        request,
        prefix: "admin",
      }),
      limit: 60,
      windowMs: 10 * 60 * 1000,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Too many requests" }, { status: 429 });
  }

  const qdrantStatus = getQdrantStatus();
  const [apiKeyScopeStatus, operationalAlerts, alertDelivery] = await Promise.all([
    getApiKeyScopeMigrationStatus(),
    getOperationalAlertsSummary(),
    Promise.resolve(getOperationalAlertDeliveryConfig()),
  ]);

  const securityStatus = {
    timestamp: new Date().toISOString(),
    
    // Encryption at Rest
    encryptionAtRest: {
      turso: {
        enabled: true,
        provider: "Turso (libSQL)",
        notes: "Turso encrypts all data at rest using AES-256. Managed by Turso Cloud.",
        docs: "https://docs.turso.tech/security",
      },
      qdrant: {
        enabled: qdrantStatus.enabled,
        provider: qdrantStatus.enabled ? "Qdrant Cloud" : "Not configured",
        notes: qdrantStatus.enabled
          ? "Qdrant Cloud encrypts all data at rest. Vectors stored in encrypted storage."
          : "Qdrant not configured, using Turso fallback.",
        docs: "https://qdrant.tech/documentation/cloud/security/",
      },
    },

    // Encryption in Transit
    encryptionInTransit: {
      api: {
        enabled: true,
        protocol: "TLS 1.3",
        notes: "All API traffic encrypted via HTTPS (Vercel edge)",
      },
      database: {
        enabled: true,
        protocol: "TLS 1.2+",
        notes: "Database connections use TLS encryption",
      },
    },

    // Authentication
    authentication: {
      userAuth: {
        provider: "Clerk",
        mfa: "Available (user-configurable)",
      },
      apiAuth: {
        method: "Bearer token",
        keyStorage: "SHA-256 hashed in database",
        scopesEnforced: true,
        migration: apiKeyScopeStatus,
      },
    },

    // Privacy Features
    privacy: {
      serverSideMemoryEncryption: {
        enabled: true,
        algorithm: "AES-256-GCM",
        keyDerivation: "Server-side SHA-256 derivation from ENCRYPTION_KEY + user_id",
        notes: "Memory content is encrypted on the server before database writes.",
      },
      namespaceHashing: {
        enabled: false,
        notes: "Namespace names are stored directly; client-only hashing is not implemented.",
      },
      embeddingPrivacy: {
        enabled: false,
        notes: "Embeddings reveal semantic similarity. Differential privacy not implemented.",
        recommendation: "Document limitation transparently",
      },
      requestSigning: {
        status: "not_enforced",
      },
    },

    // Compliance Readiness
    compliance: {
      auditLogging: {
        enabled: true,
        status: "Wired into cognitive mutations, API key management, and benchmark runs",
        retention: "90 days when enabled",
      },
      gdpr: {
        dataExport: "Implemented for cognitive data",
        dataDeletion: "Implemented",
        consent: "Shared learning and benchmark inclusion are opt-in user settings",
      },
      soc2: {
        status: "Not certified",
        readiness: "Partial (audit logging, encryption)",
      },
    },

    // Infrastructure Security
    infrastructure: {
      hosting: "Vercel (SOC2 certified)",
      waf: {
        enabled: Boolean(process.env.CLOUDFLARE_WAF_ENABLED),
        provider: process.env.CLOUDFLARE_WAF_ENABLED ? "Cloudflare" : "Vercel Firewall",
      },
      ddosProtection: {
        enabled: true,
        provider: "Vercel/Cloudflare",
      },
    },

    monitoring: {
      alerts: operationalAlerts.alerts,
      alertCount: operationalAlerts.alerts.length,
      generatedAt: operationalAlerts.generatedAt,
      delivery: alertDelivery,
    },

    // Recommendations
    recommendations: [
      !process.env.CLOUDFLARE_WAF_ENABLED && "Enable Cloudflare WAF for enhanced protection",
      !qdrantStatus.enabled && "Configure Qdrant Cloud for scalable vector search",
      apiKeyScopeStatus.legacyKeysMissingScopes > 0 && "Backfill legacy API keys with explicit scopes",
      apiKeyScopeStatus.revocableWildcardKeys > 0 && "Rotate or scope down wildcard API keys before launch",
      !alertDelivery.configured && "Configure OPS_ALERT_WEBHOOK_URL before launch so critical alerts can be delivered",
      !alertDelivery.schedule.secretConfigured && "Configure an operational alert dispatch secret before enabling automated delivery",
      operationalAlerts.alerts.length > 0 && "Clear current operational alerts before launch",
    ].filter(Boolean),
  };

  return NextResponse.json(securityStatus);
}
