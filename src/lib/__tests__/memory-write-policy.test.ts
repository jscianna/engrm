import { describe, expect, it } from "vitest";

import {
  assertClientWritableMemoryType,
  assertSystemDerivedBypassAllowed,
  MemoryWritePolicyError,
  MemoryTypeValidationError,
  assessMemoryWritePolicy,
  assertMemoryWriteAllowed,
} from "@/lib/memory-write-policy";

describe("memory write policy", () => {
  it("rejects transport metadata wrappers", () => {
    const result = assessMemoryWritePolicy(
      "[media attached: /Users/clawdaddy/.openclaw/media/inbound/file.jpg]",
    );

    expect(result.allow).toBe(false);
    expect(result.reasonCode).toBe("rejected_hard_deny");
    expect(result.policyCode).toBe("rejected_transport_metadata");
  });

  it("rejects audit fragments", () => {
    const result = assessMemoryWritePolicy(`
## A) Embedding Config Path Audit
## B) Config/Key Sources
- **Recommendation**: rotate the embedding config path
- **Current Guarantee**: config stays in process memory
- **No hot-reload contract exists**
- **In-process config memoization**
- **Blast Radius**: service-wide
- **Owner**: platform
    `.trim());

    expect(result.allow).toBe(false);
    expect(result.policyCode).toBe("rejected_audit_fragment");
  });

  it("rejects code and log blobs", () => {
    const result = assessMemoryWritePolicy(`
import { readFileSync } from "node:fs";

const query = "SELECT * FROM memories WHERE user_id = ?";

Traceback (most recent call last):
  at loadConfig (/app/index.ts:10:2)
error: ConfigError
    `.trim());

    expect(result.allow).toBe(false);
    expect(result.policyCode).toBe("rejected_code_blob");
  });

  it("rejects MCP transcript debris", () => {
    const result = assessMemoryWritePolicy(`
conversation info (untrusted)
sender (untrusted): codex
message_id=123
main agent should prefer plugin-local binary
mcp_runtime=codex
/Users/clawdaddy/.openclaw/media/inbound/file.jpg
    `.trim());

    expect(result.allow).toBe(false);
    expect(result.policyCode).toBe("rejected_mcp_transcript_debris");
  });

  it("rejects transcript debris even when padded with durable-sounding language", () => {
    const result = assessMemoryWritePolicy(`
conversation info (untrusted)
sender (untrusted): codex
main agent should route this to telegram
message_id=123
session_key=abc
mcp_runtime=codex
We decided this should be the default policy forever.
    `.trim());

    expect(result.allow).toBe(false);
    expect(result.policyCode).toBe("rejected_mcp_transcript_debris");
    expect(result.matchedRules).toContain("mcp_transcript_debris_hard_deny");
  });

  it("normalizes zero-width characters to prevent metadata wrapper bypasses", () => {
    const result = assessMemoryWritePolicy("[me\u200bdia attached: /Users/clawdaddy/.openclaw/media/inbound/file.jpg]");

    expect(result.allow).toBe(false);
    expect(result.policyCode).toBe("rejected_transport_metadata");
  });

  it("accepts durable preference memories", () => {
    const result = assessMemoryWritePolicy(
      "John prefers concise updates and complete sentences in outreach.",
    );

    expect(result.allow).toBe(true);
    expect(result.policyCode).toBe("accepted_stable_preference");
  });

  it("accepts durable decision memories", () => {
    const result = assessMemoryWritePolicy(
      "We decided to use Codex OAuth only and will not support OpenAI API key mode.",
    );

    expect(result.allow).toBe(true);
    expect(result.policyCode).toBe("accepted_multi_signal");
  });

  it("accepts transferable backstop rules", () => {
    const result = assessMemoryWritePolicy(
      "For all memory write paths, enforce the same DB backstop so routes cannot bypass policy.",
    );

    expect(result.allow).toBe(true);
    expect(result.policyCode).toBe("accepted_multi_signal");
  });

  it("does not trust system-derived types without an explicit bypass flag", () => {
    const result = assessMemoryWritePolicy("## Summary\n- task completed", {
      memoryType: "session_summary",
    });

    expect(result.allow).toBe(false);
    expect(result.reasonCode).toBe("rejected_low_quality");
  });

  it("lets trusted system-derived summaries bypass the gate", () => {
    const result = assessMemoryWritePolicy("## Summary\n- task completed", {
      memoryType: "session_summary",
      allowSystemDerivedBypass: true,
    });

    expect(result.allow).toBe(true);
    expect(result.policyCode).toBe("accepted_system_derived");
  });

  it("rejects reserved system-derived types on client write paths", () => {
    expect(() => assertClientWritableMemoryType("session_summary")).toThrowError(
      MemoryTypeValidationError,
    );
    expect(() => assertClientWritableMemoryType("compacted")).toThrowError(
      MemoryTypeValidationError,
    );
    expect(() => assertClientWritableMemoryType("decision")).not.toThrow();
  });

  it("requires an explicit trusted bypass for system-derived writes", () => {
    expect(() => assertSystemDerivedBypassAllowed("session_summary")).toThrowError(
      MemoryTypeValidationError,
    );
    expect(() => assertSystemDerivedBypassAllowed("session_summary", true)).not.toThrow();
  });

  it("rejects unknown memory types on client write paths", () => {
    expect(() => assertClientWritableMemoryType("unknown_type")).toThrowError(
      MemoryTypeValidationError,
    );
  });

  it("throws typed policy errors for backstop enforcement", () => {
    expect(() =>
      assertMemoryWriteAllowed("conversation info (untrusted)\nsender (untrusted): toolresult"),
    ).toThrowError(MemoryWritePolicyError);
  });
});
