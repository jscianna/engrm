/**
 * Security Status Dashboard API
 * 
 * Returns current security configuration and compliance status.
 * Admin-only endpoint.
 */

import { NextResponse } from "next/server";
import { getQdrantStatus } from "@/lib/qdrant";

export const runtime = "nodejs";

function isAdmin(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;
  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qdrantStatus = getQdrantStatus();

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
        enabled: false,
        status: "Implemented in code but not wired into live request flows",
        retention: "90 days when enabled",
      },
      gdpr: {
        dataExport: "Planned",
        dataDeletion: "Implemented",
        consent: "Via Clerk",
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

    // Recommendations
    recommendations: [
      !process.env.CLOUDFLARE_WAF_ENABLED && "Enable Cloudflare WAF for enhanced protection",
      !qdrantStatus.enabled && "Configure Qdrant Cloud for scalable vector search",
    ].filter(Boolean),
  };

  return NextResponse.json(securityStatus);
}
