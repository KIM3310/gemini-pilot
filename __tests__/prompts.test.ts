import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  loadPromptFile,
  loadPromptsFromDir,
  PromptRegistry,
  PromptFrontmatterSchema,
} from "../src/prompts/loader.js";

const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts");

describe("Prompt Frontmatter Schema", () => {
  it("should validate correct frontmatter", () => {
    const result = PromptFrontmatterSchema.safeParse({
      name: "architect",
      description: "System architect",
      model: "gemini-3.1-pro",
      reasoning_effort: "high",
    });
    expect(result.success).toBe(true);
  });

  it("should apply defaults for optional fields", () => {
    const result = PromptFrontmatterSchema.parse({
      name: "test",
      description: "Test agent",
    });
    expect(result.model).toBe("gemini-3.1-flash");
    expect(result.reasoning_effort).toBe("medium");
  });

  it("should reject invalid reasoning effort", () => {
    const result = PromptFrontmatterSchema.safeParse({
      name: "test",
      description: "Test",
      reasoning_effort: "extreme",
    });
    expect(result.success).toBe(false);
  });
});

describe("Prompt File Loading", () => {
  it("should load the architect prompt", () => {
    const prompt = loadPromptFile(path.join(PROMPTS_DIR, "architect.md"));
    expect(prompt).toBeDefined();
    expect(prompt!.frontmatter.name).toBe("architect");
    expect(prompt!.frontmatter.model).toBe("gemini-3.1-pro");
    expect(prompt!.body).toContain("Architect Agent");
  });

  it("should load the executor prompt", () => {
    const prompt = loadPromptFile(path.join(PROMPTS_DIR, "executor.md"));
    expect(prompt).toBeDefined();
    expect(prompt!.frontmatter.name).toBe("executor");
    expect(prompt!.frontmatter.reasoning_effort).toBe("medium");
  });

  it("should return undefined for non-existent file", () => {
    const prompt = loadPromptFile(path.join(PROMPTS_DIR, "nonexistent.md"));
    expect(prompt).toBeUndefined();
  });
});

describe("Prompts Directory Loading", () => {
  it("should load all 15 prompts from the prompts directory", () => {
    const prompts = loadPromptsFromDir(PROMPTS_DIR);
    expect(prompts.size).toBe(16);
  });

  it("should have all expected agent names", () => {
    const prompts = loadPromptsFromDir(PROMPTS_DIR);
    const names = Array.from(prompts.keys());
    expect(names).toContain("architect");
    expect(names).toContain("planner");
    expect(names).toContain("executor");
    expect(names).toContain("debugger");
    expect(names).toContain("reviewer");
    expect(names).toContain("security-auditor");
    expect(names).toContain("test-engineer");
    expect(names).toContain("optimizer");
    expect(names).toContain("documenter");
    expect(names).toContain("designer");
    expect(names).toContain("analyst");
    expect(names).toContain("scientist");
    expect(names).toContain("refactorer");
    expect(names).toContain("critic");
    expect(names).toContain("mentor");
  });

  it("should return empty map for non-existent directory", () => {
    const prompts = loadPromptsFromDir("/nonexistent/dir");
    expect(prompts.size).toBe(0);
  });
});

describe("PromptRegistry", () => {
  it("should manage prompts correctly", () => {
    const registry = new PromptRegistry();
    registry.addDirectory(PROMPTS_DIR);

    expect(registry.size).toBe(16);
    expect(registry.has("architect")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
    expect(registry.names().length).toBe(16);
    expect(registry.list().length).toBe(16);
  });

  it("should retrieve a specific prompt", () => {
    const registry = new PromptRegistry();
    registry.addDirectory(PROMPTS_DIR);

    const prompt = registry.get("debugger");
    expect(prompt).toBeDefined();
    expect(prompt!.frontmatter.description).toContain("debugger");
  });
});
