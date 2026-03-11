import { describe, expect, it } from "vitest";
import { hasClerkAdminAccess } from "../../../src/lib/admin-auth";

describe("admin auth", () => {
  it("grants admin access to allowlisted emails", () => {
    process.env.ADMIN_EMAILS = "owner@company.com";
    expect(
      hasClerkAdminAccess({
        userId: "user_123",
        email: "owner@company.com",
      }),
    ).toBe(true);
    delete process.env.ADMIN_EMAILS;
  });

  it("grants admin access from Clerk metadata", () => {
    expect(
      hasClerkAdminAccess({
        userId: "user_456",
        email: "member@company.com",
        publicMetadata: { role: "admin" },
      }),
    ).toBe(true);
  });

  it("does not grant admin access to normal users", () => {
    expect(
      hasClerkAdminAccess({
        userId: "user_789",
        email: "member@company.com",
        publicMetadata: { role: "member" },
      }),
    ).toBe(false);
  });

  it("does not grant admin access from unsafe metadata alone", () => {
    expect(
      hasClerkAdminAccess({
        userId: "user_unsafe",
        email: "member@company.com",
        // Intentionally cast to validate that unsafe metadata is ignored for authorization.
        ...( { unsafeMetadata: { role: "admin" } } as Record<string, unknown> ),
      }),
    ).toBe(false);
  });
});
