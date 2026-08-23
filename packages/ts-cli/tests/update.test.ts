import { describe, expect, it } from "vitest";
import { checkUpdate, formatUpdateMessage } from "../src/update.js";

describe("checkUpdate", () => {
  it("reports update available when remote is newer", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("raw.githubusercontent.com")) {
        return new Response("2026.08.13-1\n", { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await checkUpdate({
      repo: "scubiry-glitch/zhijian-cli-public",
      branch: "release",
      localVersion: "2026.08.12-2",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.remoteVersion).toBe("2026.08.13-1");
    expect(result.remoteBranch).toBe("release");
    expect(result.url).toContain("/tree/release");
    expect(formatUpdateMessage(result)).toContain("有可用更新");
  });

  it("reports up to date when versions match", async () => {
    const fetchImpl = async () => new Response("2026.08.12-2\n", { status: 200 });
    const result = await checkUpdate({
      branch: "release",
      localVersion: "2026.08.12-2",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.upToDate).toBe(true);
    expect(formatUpdateMessage(result)).toContain("已是最新版本");
  });

  it("hints github token on private repo 404", async () => {
    const prev = process.env.ZYT_GITHUB_TOKEN;
    delete process.env.ZYT_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("raw.githubusercontent.com")) {
        return new Response("404", { status: 404 });
      }
      if (url.includes("/repos/") && url.includes("/branches")) {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      return new Response("404", { status: 404 });
    };
    try {
      await expect(
        checkUpdate({ branch: "release", localVersion: "2026.08.12-2", fetchImpl: fetchImpl as typeof fetch }),
      ).rejects.toMatchObject({
        code: "RELEASE_CHECK_FAILED",
        message: expect.stringContaining("ZYT_GITHUB_TOKEN"),
      });
    } finally {
      if (prev !== undefined) process.env.ZYT_GITHUB_TOKEN = prev;
    }
  });
});
