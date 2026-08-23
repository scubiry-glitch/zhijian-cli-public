import { describe, expect, it, vi } from "vitest";
import { ZytClient } from "../src/client.js";
import { ApiError } from "../src/errors.js";

describe("ZytClient", () => {
  it("throws when api key missing", async () => {
    const c = new ZytClient({ baseUrl: "https://example.test" });
    await expect(c.get("/openapi/v1/me")).rejects.toMatchObject({
      code: "MISSING_API_KEY",
      exitCode: 2,
    });
  });

  it("GET me success", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "1", name: "t", dataView: "external" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const c = new ZytClient({
      baseUrl: "https://example.test",
      apiKey: "btg_x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const data = await c.get("/openapi/v1/me");
    expect(data).toEqual({ id: "1", name: "t", dataView: "external" });
    expect(fetchImpl).toHaveBeenCalled();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://example.test/openapi/v1/me");
    expect((init as RequestInit).headers).toMatchObject({
      "X-Api-Key": "btg_x",
      "User-Agent": expect.stringContaining("Mozilla/5.0"),
    });
  });

  it("maps WAF HTML 403", async () => {
    const html = "<html><title>访问已被拦截</title><body>贝壳信息安全中心</body></html>";
    const fetchImpl = vi.fn(async () => new Response(html, { status: 403 }));
    const c = new ZytClient({
      baseUrl: "https://example.test",
      apiKey: "btg_x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await c.get("/openapi/v1/me");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("WAF_BLOCKED");
      expect((e as ApiError).exitCode).toBe(3);
    }
  });

  it("maps 401", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "INVALID_API_KEY", message: "bad" }), { status: 401 }),
    );
    const c = new ZytClient({
      baseUrl: "https://example.test",
      apiKey: "btg_x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await c.get("/openapi/v1/me");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).exitCode).toBe(2);
      expect((e as ApiError).code).toBe("INVALID_API_KEY");
    }
  });
});
