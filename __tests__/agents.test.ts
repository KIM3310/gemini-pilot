import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  resolveAgent,
  AgentRegistry,
  buildAgentRegistry,
  AgentDefinitionSchema,
} from "../src/agents/registry.js";
import { loadPromptsFromDir } from "../src/prompts/loader.js";
import { DEFAULT_CONFIG } from "../src/config/schema.js";

const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts");

describe("Agent Resolution", () => {
  it("should resolve an agent from a prompt definition", () => {
    const prompts = loadPromptsFromDir(PROMPTS_DIR);
    const architectPrompt = prompts.get("architect")!;
    const agent = resolveAgent(architectPrompt, DEFAULT_CONFIG.models);

    expect(agent.name).toBe("architect");
    expect(agent.tier).toBe("high");
    expect(agent.model).toBe("gemini-3.1-pro");
    expect(agent.reasoningEffort).toBe("high");
    expect(agent.systemPrompt).toContain("Architect Agent");
  });

  it("should map models to correct tiers", () => {
    const prompts = loadPromptsFromDir(PROMPTS_DIR);

    const executor = resolveAgent(prompts.get("executor")!, DEFAULT_CONFIG.models);
    expect(executor.tier).toBe("balanced");
    expect(executor.model).toBe("gemini-3.1-flash");

    const architect = resolveAgent(prompts.get("architect")!, DEFAULT_CONFIG.models);
    expect(architect.tier).toBe("high");
    expect(architect.model).toBe("gemini-3.1-pro");
  });
});

describe("AgentDefinitionSchema", () => {
  it("should validate a correct agent definition", () => {
    const result = AgentDefinitionSchema.safeParse({
      name: "test-agent",
      description: "A test agent",
      model: "gemini-3.1-pro",
      tier: "high",
      reasoningEffort: "high",
      systemPrompt: "You are a test agent.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid tier", () => {
    const result = AgentDefinitionSchema.safeParse({
      name: "test",
      description: "Test",
      model: "model",
      tier: "ultra",
      reasoningEffort: "high",
      systemPrompt: "prompt",
    });
    expect(result.success).toBe(false);
  });
});

describe("AgentRegistry", () => {
  it("should register and retrieve agents", () => {
    const registry = new AgentRegistry();
    registry.register({
      name: "test",
      description: "Test agent",
      model: "gemini-3.1-flash",
      tier: "balanced",
      reasoningEffort: "medium",
      systemPrompt: "You are a test agent.",
    });

    expect(registry.size).toBe(1);
    expect(registry.has("test")).toBe(true);
    expect(registry.get("test")?.model).toBe("gemini-3.1-flash");
  });

  it("should build a complete registry from prompts", () => {
    const prompts = loadPromptsFromDir(PROMPTS_DIR);
    const registry = buildAgentRegistry(prompts, DEFAULT_CONFIG.models);

    expect(registry.size).toBe(15);
    expect(registry.has("architect")).toBe(true);
    expect(registry.has("executor")).toBe(true);
    expect(registry.names().length).toBe(15);
  });
});
