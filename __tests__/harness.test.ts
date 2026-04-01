import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  resolveModel,
  buildGeminiArgs,
} from "../src/harness/session.js";
import { DEFAULT_CONFIG } from "../src/config/schema.js";

describe("Session Harness", () => {
  it("should resolve models from config by tier", () => {
    expect(resolveModel(DEFAULT_CONFIG, "high")).toBe("gemini-3.1-pro");
    expect(resolveModel(DEFAULT_CONFIG, "balanced")).toBe("gemini-3.1-flash");
    expect(resolveModel(DEFAULT_CONFIG, "fast")).toBe("gemini-3.1-flash-lite");
  });

  it("should build system prompt with agent context", () => {
    const prompt = buildSystemPrompt({
      agent: {
        name: "architect",
        description: "System architect",
        model: "gemini-3.1-pro",
        tier: "high",
        reasoningEffort: "high",
        systemPrompt: "You are a senior architect.",
      },
    });

    expect(prompt).toContain("Your Role");
    expect(prompt).toContain("senior architect");
  });

  it("should build system prompt with AGENTS.md contract", () => {
    const prompt = buildSystemPrompt({
      agentsContract: "# Operating Principles\n\n1. Clarity First",
    });

    expect(prompt).toContain("Orchestration Contract");
    expect(prompt).toContain("Clarity First");
  });

  it("should combine all context sources", () => {
    const prompt = buildSystemPrompt({
      agent: {
        name: "test",
        description: "Test",
        model: "model",
        tier: "balanced",
        reasoningEffort: "medium",
        systemPrompt: "Agent prompt here",
      },
      agentsContract: "Contract here",
      projectMemory: '{"techStack": ["TypeScript"]}',
      workflowContext: "Running autopilot step 3",
    });

    expect(prompt).toContain("Agent prompt here");
    expect(prompt).toContain("Contract here");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("autopilot step 3");
  });

  it("should return empty string when no context provided", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toBe("");
  });
});

describe("Gemini CLI Args Builder", () => {
  it("should include model flag", () => {
    const args = buildGeminiArgs({
      model: "gemini-3.1-pro",
      approvalMode: "auto",
    });
    expect(args).toContain("--model");
    expect(args).toContain("gemini-3.1-pro");
  });

  it("should include sandbox flag for yolo mode", () => {
    const args = buildGeminiArgs({
      model: "gemini-3.1-flash",
      approvalMode: "yolo",
    });
    expect(args).toContain("--sandbox=false");
  });

  it("should not include sandbox flag for auto mode", () => {
    const args = buildGeminiArgs({
      model: "gemini-3.1-flash",
      approvalMode: "auto",
    });
    expect(args).not.toContain("--sandbox=false");
  });

  it("should include system prompt when provided", () => {
    const args = buildGeminiArgs({
      model: "gemini-3.1-flash",
      approvalMode: "auto",
      systemPrompt: "You are helpful",
    });
    expect(args).toContain("--system-prompt");
    expect(args).toContain("You are helpful");
  });
});
