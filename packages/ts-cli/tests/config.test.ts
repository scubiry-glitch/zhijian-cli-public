import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadConfig,
  saveConfig,
  DEFAULT_BASE_URL,
  projectConfigPath,
} from "../src/config.js";

describe("loadConfig", () => {
  it("prefers env over defaults", () => {
    const prevKey = process.env.ZYT_API_KEY;
    const prevUrl = process.env.ZYT_BASE_URL;
    process.env.ZYT_API_KEY = "btg_test_env";
    process.env.ZYT_BASE_URL = "https://example.test";
    try {
      const cfg = loadConfig();
      expect(cfg.apiKey).toBe("btg_test_env");
      expect(cfg.baseUrl).toBe("https://example.test");
    } finally {
      if (prevKey === undefined) delete process.env.ZYT_API_KEY;
      else process.env.ZYT_API_KEY = prevKey;
      if (prevUrl === undefined) delete process.env.ZYT_BASE_URL;
      else process.env.ZYT_BASE_URL = prevUrl;
    }
  });

  it("cli overrides beat env", () => {
    process.env.ZYT_API_KEY = "btg_env";
    const cfg = loadConfig({ apiKey: "btg_cli", baseUrl: "https://cli.test" });
    expect(cfg.apiKey).toBe("btg_cli");
    expect(cfg.baseUrl).toBe("https://cli.test");
    delete process.env.ZYT_API_KEY;
  });

  it("defaults base url", () => {
    delete process.env.ZYT_BASE_URL;
    const cfg = loadConfig({});
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("reads project .zyt/config.json before home", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zyt-proj-"));
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "command-contract.md"), "# stub\n");
    fs.mkdirSync(path.join(tmp, ".zyt"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, ".zyt", "config.json"),
      JSON.stringify({ apiKey: "btg_project", baseUrl: "https://project.test" }),
    );
    const prevKey = process.env.ZYT_API_KEY;
    const prevUrl = process.env.ZYT_BASE_URL;
    delete process.env.ZYT_API_KEY;
    delete process.env.ZYT_BASE_URL;
    try {
      expect(projectConfigPath(tmp)).toBe(path.join(tmp, ".zyt", "config.json"));
      const cfg = loadConfig({}, tmp);
      expect(cfg.apiKey).toBe("btg_project");
      expect(cfg.baseUrl).toBe("https://project.test");
    } finally {
      if (prevKey === undefined) delete process.env.ZYT_API_KEY;
      else process.env.ZYT_API_KEY = prevKey;
      if (prevUrl === undefined) delete process.env.ZYT_BASE_URL;
      else process.env.ZYT_BASE_URL = prevUrl;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("saveConfig", () => {
  it("writes json under home config dir when HOME overridden and preferHome", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zyt-cfg-"));
    const prevHome = process.env.HOME;
    process.env.HOME = tmp;
    try {
      const next = saveConfig(
        { apiKey: "btg_x", baseUrl: "https://saved.test" },
        { preferHome: true },
      );
      const p = path.join(tmp, ".config", "zyt", "config.json");
      expect(next.path).toBe(p);
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      expect(raw.apiKey).toBe("btg_x");
      expect(raw.baseUrl).toBe("https://saved.test");
    } finally {
      process.env.HOME = prevHome;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("writes project .zyt/config.json when inside repo", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zyt-save-proj-"));
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "command-contract.md"), "# stub\n");
    try {
      const next = saveConfig(
        { apiKey: "btg_repo", baseUrl: "https://repo.test" },
        { cwd: tmp },
      );
      const p = path.join(tmp, ".zyt", "config.json");
      expect(next.path).toBe(p);
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      expect(raw.apiKey).toBe("btg_repo");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
