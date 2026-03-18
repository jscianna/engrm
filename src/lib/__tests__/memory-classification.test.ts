import { describe, expect, it } from "vitest";

import { classifyPeer } from "@/lib/memory-classification";

describe("classifyPeer", () => {
  it("classifies user preference memories as user", () => {
    expect(classifyPeer("The user prefers snake_case and early returns.")).toBe("user");
  });

  it("classifies environment and project facts as agent", () => {
    expect(classifyPeer("The project uses Next.js and runs on Vercel in this repo.")).toBe(
      "agent",
    );
  });

  it("classifies team-wide conventions as shared", () => {
    expect(classifyPeer("Team agreed on a company-wide naming convention across projects.")).toBe(
      "shared",
    );
  });

  it("defaults to user when there is no stronger signal", () => {
    expect(classifyPeer("Remember to follow up tomorrow.")).toBe("user");
  });
});
