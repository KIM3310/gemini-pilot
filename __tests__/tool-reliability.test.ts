/**
 * Tests for the tool-reliability module.
 *
 * Covers: rjson, schema-coerce, parser, retry, benchmark
 * 20+ test cases total.
 */

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { rjsonParse } from "../src/tool-reliability/rjson.js";
import { coerceToSchema, snakeToCamel, camelToSnake } from "../src/tool-reliability/schema-coerce.js";
import { parseToolCalls, type ToolDefinition } from "../src/tool-reliability/parser.js";
import { parseWithRetry, buildRetryPrompt, createMetricsTracker } from "../src/tool-reliability/retry.js";
import { runToolBenchmark, BENCHMARK_CASES, formatBenchmarkTable } from "../src/tool-reliability/benchmark.js";

// ---- rjson tests ----

describe("rjson: robust JSON parser", () => {
  it("parses valid JSON unchanged", () => {
    const result = rjsonParse('{"key": "value", "num": 42}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ key: "value", num: 42 });
  });

  it("handles trailing commas", () => {
    const result = rjsonParse('{"a": 1, "b": 2,}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1, b: 2 });
  });

  it("handles single-quoted strings", () => {
    const result = rjsonParse("{'name': 'hello', 'count': 5}");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ name: "hello", count: 5 });
  });

  it("handles unquoted keys", () => {
    const result = rjsonParse('{name: "world", value: 99}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ name: "world", value: 99 });
  });

  it("strips line and block comments", () => {
    const input = `{
      // this is a comment
      "key": "val" /* inline comment */
    }`;
    const result = rjsonParse(input);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ key: "val" });
  });

  it("recovers from missing closing brace", () => {
    const result = rjsonParse('{"a": 1, "b": {"c": 2}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1, b: { c: 2 } });
  });

  it("extracts JSON from markdown code fence", () => {
    const input = '```json\n{"x": 1}\n```';
    const result = rjsonParse(input);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ x: 1 });
  });

  it("extracts JSON from surrounding text", () => {
    const input = 'Here is the result:\n{"status": "ok"}\nDone.';
    const result = rjsonParse(input);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ status: "ok" });
  });

  it("handles double/extra commas", () => {
    const result = rjsonParse('{"a": 1,, "b": 2}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1, b: 2 });
  });

  it("returns error for empty input", () => {
    const result = rjsonParse("");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("parses arrays with trailing commas", () => {
    const result = rjsonParse("[1, 2, 3,]");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([1, 2, 3]);
  });
});

// ---- schema-coerce tests ----

describe("schema-coerce: type coercion and key normalization", () => {
  it("coerces string to number", () => {
    const schema = z.object({ count: z.number() });
    const result = coerceToSchema(schema, { count: "42" });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ count: 42 });
  });

  it("coerces string to boolean", () => {
    const schema = z.object({ enabled: z.boolean() });
    const result = coerceToSchema(schema, { enabled: "true" });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ enabled: true });
  });

  it("coerces 'false' string to boolean false", () => {
    const schema = z.object({ enabled: z.boolean() });
    const result = coerceToSchema(schema, { enabled: "false" });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ enabled: false });
  });

  it("wraps single value into array", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const result = coerceToSchema(schema, { tags: "solo" });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ tags: ["solo"] });
  });

  it("normalizes snake_case to camelCase keys", () => {
    const schema = z.object({ maxResults: z.number() });
    const result = coerceToSchema(schema, { max_results: "10" });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ maxResults: 10 });
  });

  it("strips unknown fields", () => {
    const schema = z.object({ name: z.string() });
    const result = coerceToSchema(schema, { name: "test", extra: "junk" });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ name: "test" });
  });

  it("handles nested object coercion", () => {
    const schema = z.object({
      config: z.object({
        retries: z.number(),
      }),
    });
    const result = coerceToSchema(schema, { config: { retries: "3" } });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ config: { retries: 3 } });
  });

  it("coerces number to string", () => {
    const schema = z.object({ label: z.string() });
    const result = coerceToSchema(schema, { label: 42 });
    expect(result.coerced).toBe(true);
    expect(result.value).toEqual({ label: "42" });
  });

  it("snakeToCamel and camelToSnake helpers work", () => {
    expect(snakeToCamel("max_results")).toBe("maxResults");
    expect(snakeToCamel("hello_world_test")).toBe("helloWorldTest");
    expect(camelToSnake("maxResults")).toBe("max_results");
    expect(camelToSnake("helloWorldTest")).toBe("hello_world_test");
  });
});

// ---- parser tests ----

const testTools: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "Get weather",
    parameters: z.object({
      location: z.string(),
      units: z.enum(["celsius", "fahrenheit"]).optional(),
    }),
  },
  {
    name: "search",
    description: "Search",
    parameters: z.object({
      query: z.string(),
      maxResults: z.number().optional(),
    }),
  },
];

describe("parser: tool call extraction", () => {
  it("parses JSON tool call", () => {
    const result = parseToolCalls(
      '{"name": "get_weather", "arguments": {"location": "London"}}',
      testTools,
    );
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.name).toBe("get_weather");
    expect(result.calls[0]!.arguments).toEqual({ location: "London" });
    expect(result.format).toBe("json");
  });

  it("parses XML tool call", () => {
    const result = parseToolCalls(
      '<tool_call><name>get_weather</name><arguments>{"location": "Paris"}</arguments></tool_call>',
      testTools,
    );
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.name).toBe("get_weather");
    expect(result.format).toBe("xml");
  });

  it("parses markdown-wrapped tool call", () => {
    const result = parseToolCalls(
      '```json\n{"name": "search", "arguments": {"query": "test"}}\n```',
      testTools,
    );
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.name).toBe("search");
    expect(result.format).toBe("markdown");
  });

  it("parses array of tool calls", () => {
    const result = parseToolCalls(
      '[{"name": "get_weather", "arguments": {"location": "A"}}, {"name": "search", "arguments": {"query": "B"}}]',
      testTools,
    );
    expect(result.calls).toHaveLength(2);
  });

  it("applies coercion on tool arguments", () => {
    const result = parseToolCalls(
      '{"name": "search", "arguments": {"query": "food", "maxResults": "5"}}',
      testTools,
    );
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]!.arguments.maxResults).toBe(5);
    expect(result.coercions.length).toBeGreaterThan(0);
  });

  it("reports error for unknown tool", () => {
    const result = parseToolCalls(
      '{"name": "nonexistent", "arguments": {}}',
      testTools,
    );
    expect(result.calls).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles empty input", () => {
    const result = parseToolCalls("", testTools);
    expect(result.calls).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---- retry tests ----

describe("retry: bounded retry behavior", () => {
  it("succeeds on first attempt without retry", async () => {
    const mockModel = vi.fn().mockResolvedValue('{"name": "get_weather", "arguments": {"location": "X"}}');
    const result = await parseWithRetry(
      '{"name": "get_weather", "arguments": {"location": "X"}}',
      testTools,
      mockModel,
      "test prompt",
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 },
    );
    expect(result.calls).toHaveLength(1);
    expect(result.metrics.totalAttempts).toBe(1);
    expect(result.metrics.succeeded).toBe(true);
    expect(mockModel).not.toHaveBeenCalled();
  });

  it("retries on initial failure and succeeds", async () => {
    const mockModel = vi.fn().mockResolvedValue('{"name": "get_weather", "arguments": {"location": "Y"}}');
    const result = await parseWithRetry(
      "not valid json at all",
      testTools,
      mockModel,
      "test prompt",
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 },
    );
    expect(result.calls).toHaveLength(1);
    expect(result.metrics.totalAttempts).toBe(2);
    expect(result.metrics.succeeded).toBe(true);
    expect(mockModel).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and returns failure", async () => {
    const mockModel = vi.fn().mockResolvedValue("still garbage");
    const result = await parseWithRetry(
      "bad output",
      testTools,
      mockModel,
      "test prompt",
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 },
    );
    expect(result.calls).toHaveLength(0);
    expect(result.metrics.totalAttempts).toBe(3); // 1 initial + 2 retries
    expect(result.metrics.succeeded).toBe(false);
    expect(mockModel).toHaveBeenCalledTimes(2);
  });

  it("builds retry prompt with error context", () => {
    const prompt = buildRetryPrompt("original", ["Error A", "Error B"], 2);
    expect(prompt).toContain("original");
    expect(prompt).toContain("[RETRY 2]");
    expect(prompt).toContain("Error A");
    expect(prompt).toContain("Error B");
  });

  it("metrics tracker aggregates correctly", () => {
    const tracker = createMetricsTracker();
    tracker.record({ totalAttempts: 1, succeeded: true, totalTimeMs: 50, attemptErrors: [] });
    tracker.record({ totalAttempts: 3, succeeded: false, totalTimeMs: 200, attemptErrors: ["err"] });
    tracker.record({ totalAttempts: 2, succeeded: true, totalTimeMs: 100, attemptErrors: [] });

    const agg = tracker.getAggregate();
    expect(agg.totalInvocations).toBe(3);
    expect(agg.successfulInvocations).toBe(2);
    expect(agg.totalRetries).toBe(3); // 0 + 2 + 1
    expect(agg.successRate).toBeCloseTo(2 / 3);
  });
});

// ---- benchmark tests ----

describe("benchmark: test case execution", () => {
  it("has at least 20 test cases", () => {
    expect(BENCHMARK_CASES.length).toBeGreaterThanOrEqual(20);
  });

  it("runs all cases and produces valid results", () => {
    const result = runToolBenchmark();
    expect(result.cases.length).toBe(BENCHMARK_CASES.length);
    expect(result.baselineRate).toBeGreaterThanOrEqual(0);
    expect(result.baselineRate).toBeLessThanOrEqual(1);
    expect(result.middlewareRate).toBeGreaterThanOrEqual(0);
    expect(result.middlewareRate).toBeLessThanOrEqual(1);
    // Middleware should outperform baseline
    expect(result.middlewareRate).toBeGreaterThan(result.baselineRate);
    expect(result.improvement).toBeGreaterThan(0);
  });

  it("middleware passes all 24 cases", () => {
    const result = runToolBenchmark();
    const failedCases = result.cases.filter((c) => !c.middlewarePass);
    expect(failedCases).toEqual([]);
  });

  it("formats benchmark table as string", () => {
    const result = runToolBenchmark();
    const table = formatBenchmarkTable(result);
    expect(table).toContain("Tool Reliability Benchmark Results");
    expect(table).toContain("Baseline");
    expect(table).toContain("Middleware");
    expect(table).toContain("Improvement");
  });
});
