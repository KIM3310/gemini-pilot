/**
 * Tests for the CLI provider adapter layer.
 */

import { describe, it, expect } from "vitest";
import { getProvider, PROVIDERS, SUPPORTED_PROVIDERS } from "../src/providers/index.js";
import { loadConfig } from "../src/config/loader.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("providers registry", () => {
  it("exposes Gemini and Qwen providers", () => {
    expect(SUPPORTED_PROVIDERS).toEqual(["gemini", "qwen"]);
  });

  it("Gemini provider has expected shape", () => {
    const p = getProvider("gemini");
    expect(p.id).toBe("gemini");
    expect(p.binary).toBe("gemini");
    expect(p.displayName).toMatch(/Gemini/);
    expect(p.installCommand).toContain("@google/gemini-cli");
    expect(p.defaultModels.high).toContain("gemini");
  });

  it("Qwen provider has expected shape", () => {
    const p = getProvider("qwen");
    expect(p.id).toBe("qwen");
    expect(p.binary).toBe("qwen");
    expect(p.displayName).toMatch(/Qwen/);
    expect(p.installCommand).toContain("qwen-code");
    expect(p.defaultModels.high).toContain("qwen");
  });

  it("throws on unknown provider id", () => {
    // @ts-expect-error - testing runtime guard
    expect(() => getProvider("claude")).toThrow(/Unknown provider/);
  });

  it("PROVIDERS record is frozen", () => {
    expect(Object.isFrozen(PROVIDERS)).toBe(true);
  });
});

describe("config loader + providers", () => {
  const ENV_VARS = ["MCP_PROVIDER", "GP_PROVIDER", "GP_MODEL_HIGH", "GP_MODEL_BALANCED", "GP_MODEL_FAST"];
  const snapshot: Record<string, string | undefined> = {};

  function clearEnv() {
    for (const k of ENV_VARS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  }
  function restoreEnv() {
    for (const k of ENV_VARS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  }

  it("defaults to the Gemini provider with Gemini model ids", () => {
    clearEnv();
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prov-"));
      const config = loadConfig(tmp);
      expect(config.provider).toBe("gemini");
      expect(config.models.high).toMatch(/gemini/);
    } finally {
      restoreEnv();
    }
  });

  it("MCP_PROVIDER=qwen substitutes Qwen model defaults", () => {
    clearEnv();
    process.env.MCP_PROVIDER = "qwen";
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prov-"));
      const config = loadConfig(tmp);
      expect(config.provider).toBe("qwen");
      expect(config.models.high).toMatch(/qwen/);
      expect(config.models.balanced).toMatch(/qwen/);
      expect(config.models.fast).toMatch(/qwen/);
    } finally {
      restoreEnv();
    }
  });

  it("GP_PROVIDER alias still works", () => {
    clearEnv();
    process.env.GP_PROVIDER = "qwen";
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prov-"));
      const config = loadConfig(tmp);
      expect(config.provider).toBe("qwen");
    } finally {
      restoreEnv();
    }
  });

  it("explicit GP_MODEL_HIGH wins over provider defaults", () => {
    clearEnv();
    process.env.MCP_PROVIDER = "qwen";
    process.env.GP_MODEL_HIGH = "my-custom-model";
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prov-"));
      const config = loadConfig(tmp);
      expect(config.provider).toBe("qwen");
      expect(config.models.high).toBe("my-custom-model");
      // Untouched tiers still pick up Qwen defaults
      expect(config.models.balanced).toMatch(/qwen/);
    } finally {
      restoreEnv();
    }
  });

  it("unknown MCP_PROVIDER value falls back to default", () => {
    clearEnv();
    process.env.MCP_PROVIDER = "bogus";
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prov-"));
      const config = loadConfig(tmp);
      expect(config.provider).toBe("gemini");
    } finally {
      restoreEnv();
    }
  });
});
