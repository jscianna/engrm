import { describe, expect, it } from "vitest";

import { detectProjectScope } from "@/lib/project-scope";

describe("detectProjectScope", () => {
  it("prefers an explicit namespace", () => {
    expect(
      detectProjectScope({
        namespace: "github.com/acme/fathippo",
        sessionMeta: { cwd: "/Users/me/projects/other" },
        messageText: "help with auth",
      }),
    ).toEqual({
      detected: true,
      scope: "github.com/acme/fathippo",
      confidence: 1,
      source: "namespace",
    });
  });

  it("extracts scope from session repo metadata", () => {
    expect(
      detectProjectScope({
        sessionMeta: { repo: "github.com/acme/fathippo" },
        messageText: "help with auth",
      }),
    ).toEqual({
      detected: true,
      scope: "fathippo",
      confidence: 0.9,
      source: "session_meta",
    });
  });

  it("extracts scope from session cwd metadata", () => {
    expect(
      detectProjectScope({
        sessionMeta: { cwd: "/Users/clawdaddy/clawd/projects/fathippo" },
        messageText: "help with auth",
      }),
    ).toEqual({
      detected: true,
      scope: "fathippo",
      confidence: 0.9,
      source: "session_meta",
    });
  });

  it("falls back to message content hints", () => {
    expect(
      detectProjectScope({
        messageText: "What changed in the fathippo repo auth flow?",
      }),
    ).toEqual({
      detected: true,
      scope: "fathippo",
      confidence: 0.6,
      source: "content_hint",
    });
  });

  it("returns none when no project signal is present", () => {
    expect(
      detectProjectScope({
        messageText: "What does the user prefer?",
      }),
    ).toEqual({
      detected: false,
      scope: null,
      confidence: 0,
      source: "none",
    });
  });
});
