import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  getToolBenchCases,
  validateCase,
  evaluateCall,
  checkType,
  runToolBench,
  isToolCallingPromptAvailable,
  type ToolBenchCase,
  type ToolSchema,
} from "../src/tool-bench/runner.js";
import { loadPromptFile, loadPromptsFromDir } from "../src/prompts/loader.js";
import { buildSystemPrompt } from "../src/harness/session.js";

const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts");

// ---------------------------------------------------------------------------
// 1. Tool-calling prompt loads correctly
// ---------------------------------------------------------------------------
describe("Tool-calling prompt loading", () => {
  it("should load the tool-calling prompt file from prompts directory", () => {
    const prompt = loadPromptFile(path.join(PROMPTS_DIR, "tool-calling.md"));
    expect(prompt).toBeDefined();
    expect(prompt!.frontmatter.name).toBe("tool-calling");
    expect(prompt!.frontmatter.model).toBe("gemini-3.1-pro");
    expect(prompt!.frontmatter.reasoning_effort).toBe("high");
  });

  it("should include tool-calling in prompts directory listing", () => {
    const prompts = loadPromptsFromDir(PROMPTS_DIR);
    expect(prompts.has("tool-calling")).toBe(true);
  });

  it("should have a substantial body with key sections", () => {
    const prompt = loadPromptFile(path.join(PROMPTS_DIR, "tool-calling.md"));
    expect(prompt).toBeDefined();
    expect(prompt!.body).toContain("Tool Calling Optimization Protocol");
    expect(prompt!.body).toContain("Parameter Type Enforcement");
    expect(prompt!.body).toContain("Pre-Call Verification Checklist");
    expect(prompt!.body).toContain("Error Self-Correction");
    expect(prompt!.body).toContain("Common LLM Mistakes");
  });

  it("should be discoverable via isToolCallingPromptAvailable", () => {
    expect(isToolCallingPromptAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Benchmark cases are valid
// ---------------------------------------------------------------------------
describe("Tool-bench cases", () => {
  it("should have exactly 20 benchmark cases", () => {
    const cases = getToolBenchCases();
    expect(cases.length).toBe(20);
  });

  it("should have 5 cases per category", () => {
    const cases = getToolBenchCases();
    const byCat = new Map<string, number>();
    for (const c of cases) {
      byCat.set(c.category, (byCat.get(c.category) ?? 0) + 1);
    }
    expect(byCat.get("simple")).toBe(5);
    expect(byCat.get("type-coercion")).toBe(5);
    expect(byCat.get("multi-param")).toBe(5);
    expect(byCat.get("multi-tool")).toBe(5);
  });

  it("should have unique case IDs", () => {
    const cases = getToolBenchCases();
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should validate all 20 cases as structurally sound", () => {
    const cases = getToolBenchCases();
    for (const tc of cases) {
      expect(validateCase(tc)).toBe(true);
    }
  });

  it("should reject a case with missing required params", () => {
    const bad: ToolBenchCase = {
      id: "bad-01",
      category: "simple",
      prompt: "test",
      tools: [{
        name: "fn",
        description: "test",
        parameters: { x: { type: "string", required: true } },
      }],
      expected: [{ name: "fn", arguments: {} }], // missing required x
    };
    expect(validateCase(bad)).toBe(false);
  });

  it("should reject a case with tool name mismatch", () => {
    const bad: ToolBenchCase = {
      id: "bad-02",
      category: "simple",
      prompt: "test",
      tools: [{
        name: "fn_a",
        description: "test",
        parameters: {},
      }],
      expected: [{ name: "fn_b", arguments: {} }], // fn_b not in tools
    };
    expect(validateCase(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Prompt is injected when tools are present
// ---------------------------------------------------------------------------
describe("Tool-calling prompt injection in session", () => {
  it("should include tool-calling content when toolsEnabled is true", () => {
    const prompt = buildSystemPrompt({ toolsEnabled: true });
    expect(prompt).toContain("Tool Calling Optimization Protocol");
    expect(prompt).toContain("Parameter Type Enforcement");
  });

  it("should NOT include tool-calling content when toolsEnabled is false", () => {
    const prompt = buildSystemPrompt({ toolsEnabled: false });
    expect(prompt).not.toContain("Tool Calling Optimization Protocol");
  });

  it("should NOT include tool-calling content when toolsEnabled is omitted", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).not.toContain("Tool Calling Optimization Protocol");
  });

  it("should combine tool-calling prompt with other context", () => {
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
      toolsEnabled: true,
    });

    expect(prompt).toContain("Agent prompt here");
    expect(prompt).toContain("Contract here");
    expect(prompt).toContain("Tool Calling Optimization Protocol");
  });
});

// ---------------------------------------------------------------------------
// 4. Type checking utilities
// ---------------------------------------------------------------------------
describe("checkType utility", () => {
  it("should correctly identify string type", () => {
    expect(checkType("hello", "string")).toBe(true);
    expect(checkType(42, "string")).toBe(false);
  });

  it("should correctly identify number type", () => {
    expect(checkType(42, "number")).toBe(true);
    expect(checkType(3.14, "number")).toBe(true);
    expect(checkType("42", "number")).toBe(false);
  });

  it("should correctly identify integer type", () => {
    expect(checkType(42, "integer")).toBe(true);
    expect(checkType(3.14, "integer")).toBe(false);
    expect(checkType("42", "integer")).toBe(false);
  });

  it("should correctly identify boolean type", () => {
    expect(checkType(true, "boolean")).toBe(true);
    expect(checkType(false, "boolean")).toBe(true);
    expect(checkType("true", "boolean")).toBe(false);
    expect(checkType(1, "boolean")).toBe(false);
  });

  it("should correctly identify array type", () => {
    expect(checkType([1, 2], "array")).toBe(true);
    expect(checkType([], "array")).toBe(true);
    expect(checkType("[]", "array")).toBe(false);
  });

  it("should correctly identify object type", () => {
    expect(checkType({ a: 1 }, "object")).toBe(true);
    expect(checkType(null, "object")).toBe(false);
    expect(checkType([1], "object")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. evaluateCall correctness
// ---------------------------------------------------------------------------
describe("evaluateCall", () => {
  const tool: ToolSchema = {
    name: "create_user",
    description: "Create a user",
    parameters: {
      name: { type: "string", required: true },
      age: { type: "integer", required: true },
      active: { type: "boolean" },
    },
  };

  it("should pass for correct call", () => {
    const result = evaluateCall(
      { name: "create_user", arguments: { name: "Alice", age: 30 } },
      { name: "create_user", arguments: { name: "Alice", age: 30 } },
      tool,
    );
    expect(result.pass).toBe(true);
  });

  it("should fail for wrong function name", () => {
    const result = evaluateCall(
      { name: "delete_user", arguments: { name: "Alice", age: 30 } },
      { name: "create_user", arguments: { name: "Alice", age: 30 } },
      tool,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Wrong function");
  });

  it("should fail for missing required param", () => {
    const result = evaluateCall(
      { name: "create_user", arguments: { name: "Alice" } }, // missing age
      { name: "create_user", arguments: { name: "Alice", age: 30 } },
      tool,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Missing required param");
  });

  it("should fail for wrong type", () => {
    const result = evaluateCall(
      { name: "create_user", arguments: { name: "Alice", age: "thirty" } }, // string not integer
      { name: "create_user", arguments: { name: "Alice", age: 30 } },
      tool,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Wrong type");
  });

  it("should fail for unknown param", () => {
    const result = evaluateCall(
      { name: "create_user", arguments: { name: "Alice", age: 30, email: "a@b.com" } },
      { name: "create_user", arguments: { name: "Alice", age: 30 } },
      tool,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Unknown param");
  });
});

// ---------------------------------------------------------------------------
// 6. Full benchmark run
// ---------------------------------------------------------------------------
describe("runToolBench", () => {
  it("should return results for all 20 cases", () => {
    const result = runToolBench();
    expect(result.totalCases).toBe(20);
    expect(result.cases.length).toBe(20);
    expect(result.passed + result.failed).toBe(20);
  });

  it("should have a success rate between 0 and 100", () => {
    const result = runToolBench();
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.successRate).toBeLessThanOrEqual(100);
  });

  it("should pass all self-consistency checks on valid cases", () => {
    const result = runToolBench();
    // All built-in cases should self-validate successfully
    expect(result.passed).toBe(20);
    expect(result.successRate).toBe(100);
  });
});
