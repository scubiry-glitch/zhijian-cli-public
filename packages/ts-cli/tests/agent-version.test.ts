import { describe, expect, it } from "vitest";
import { compareAgentVersions, parseAgentVersion } from "../src/agent-version.js";

describe("agent version", () => {
  it("parses YYYY.MM.DD-N", () => {
    expect(parseAgentVersion("2026.08.12-2")).toEqual([2026, 8, 12, 2]);
    expect(parseAgentVersion("bad")).toBeNull();
  });

  it("compares versions", () => {
    expect(compareAgentVersions("2026.08.12-2", "2026.08.12-1")).toBeGreaterThan(0);
    expect(compareAgentVersions("2026.08.13-1", "2026.08.12-9")).toBeGreaterThan(0);
    expect(compareAgentVersions("2026.08.12-2", "2026.08.12-2")).toBe(0);
  });
});
