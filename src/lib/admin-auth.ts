import crypto from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";

export type AdminIdentity = {
  isAdmin: boolean;
  source: "api_key" | "clerk" | "none";
  userId: string | null;
  email: string | null;
};

type AdminMetadataValue = {
  role?: unknown;
  roles?: unknown;
  admin?: unknown;
  isAdmin?: unknown;
};

function allowlistedValues(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function metadataGrantsAdminAccess(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const metadata = value as AdminMetadataValue;
  if (metadata.admin === true || metadata.isAdmin === true) {
    return true;
  }

  if (typeof metadata.role === "string" && metadata.role.toLowerCase() === "admin") {
    return true;
  }

  if (Array.isArray(metadata.roles)) {
    return metadata.roles.some((role) => typeof role === "string" && role.toLowerCase() === "admin");
  }

  return false;
}

export function hasClerkAdminAccess(params: {
  userId: string | null;
  email: string | null;
  publicMetadata?: unknown;
  privateMetadata?: unknown;
}): boolean {
  if (!params.userId) {
    return false;
  }

  const allowlistedUserIds = allowlistedValues("ADMIN_USER_IDS");
  if (allowlistedUserIds.has(params.userId.toLowerCase())) {
    return true;
  }

  if (params.email) {
    const allowlistedEmails = allowlistedValues("ADMIN_EMAILS");
    if (allowlistedEmails.has(params.email.toLowerCase())) {
      return true;
    }
  }

  return (
    metadataGrantsAdminAccess(params.publicMetadata) ||
    metadataGrantsAdminAccess(params.privateMetadata)
  );
}

export function isAdminRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const provided = authHeader.slice("Bearer ".length);
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(adminKey, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function assertAdminRequest(request: Request): void {
  if (!isAdminRequest(request)) {
    throw new Error("Unauthorized");
  }
}

export async function getAdminIdentity(request?: Request): Promise<AdminIdentity> {
  if (request && isAdminRequest(request)) {
    return {
      isAdmin: true,
      source: "api_key",
      userId: null,
      email: null,
    };
  }

  const [{ userId }, user] = await Promise.all([auth(), currentUser().catch(() => null)]);
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
  const isAdmin = hasClerkAdminAccess({
    userId,
    email,
    publicMetadata: user?.publicMetadata,
    privateMetadata: user?.privateMetadata,
  });

  return {
    isAdmin,
    source: isAdmin ? "clerk" : "none",
    userId: userId ?? null,
    email,
  };
}

export async function isAdminViewer(): Promise<boolean> {
  const identity = await getAdminIdentity();
  return identity.isAdmin;
}

export async function assertAdminViewer(): Promise<AdminIdentity> {
  const identity = await getAdminIdentity();
  if (!identity.isAdmin) {
    throw new Error("Unauthorized");
  }
  return identity;
}

export async function assertAdminAccess(request?: Request): Promise<AdminIdentity> {
  const identity = await getAdminIdentity(request);
  if (!identity.isAdmin) {
    throw new Error("Unauthorized");
  }
  return identity;
}
