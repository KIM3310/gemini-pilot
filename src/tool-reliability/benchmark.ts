/**
 * Tool Reliability Benchmark (BFCL-style)
 *
 * Defines test cases for measuring tool-call parsing and coercion
 * success rates, comparing baseline (strict JSON.parse) against
 * the full reliability middleware.
 *
 * @module tool-reliability/benchmark
 */

import { z } from "zod";
import { parseToolCalls, type ToolDefinition } from "./parser.js";
import type { ToolCall } from "./parser.js";

/** A single benchmark test case. */
export interface BenchmarkCase {
  /** Unique identifier. */
  id: string;
  /** Category for grouping results. */
  category: "simple" | "nested" | "multi-tool" | "missing-params" | "wrong-types" | "malformed" | "xml" | "markdown";
  /** Description of what this case tests. */
  description: string;
  /** Raw model output text. */
  modelOutput: string;
  /** Available tool definitions. */
  tools: ToolDefinition[];
  /** Expected parsed tool calls. */
  expected: ToolCall[];
}

/** Result of running a single benchmark case. */
export interface ToolReliabilityCaseResult {
  id: string;
  category: string;
  /** Whether baseline (strict JSON.parse) succeeded. */
  baselinePass: boolean;
  /** Whether the middleware succeeded. */
  middlewarePass: boolean;
  /** Errors from baseline attempt. */
  baselineErrors: string[];
  /** Errors from middleware attempt. */
  middlewareErrors: string[];
}

/** Aggregate benchmark results. */
export interface ToolBenchmarkResult {
  /** Individual case results. */
  cases: ToolReliabilityCaseResult[];
  /** Baseline success rate. */
  baselineRate: number;
  /** Middleware success rate. */
  middlewareRate: number;
  /** Improvement in percentage points. */
  improvement: number;
  /** Per-category breakdown. */
  categories: Record<string, { baseline: number; middleware: number; total: number }>;
}

// ---- Tool definitions used across test cases ----

const weatherTool: ToolDefinition = {
  name: "get_weather",
  description: "Get current weather for a location",
  parameters: z.object({
    location: z.string(),
    units: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
};

const searchTool: ToolDefinition = {
  name: "search",
  description: "Search the web",
  parameters: z.object({
    query: z.string(),
    maxResults: z.number().optional(),
  }),
};

const createFileTool: ToolDefinition = {
  name: "create_file",
  description: "Create a file with content",
  parameters: z.object({
    path: z.string(),
    content: z.string(),
    overwrite: z.boolean().optional(),
  }),
};

const sendMessageTool: ToolDefinition = {
  name: "send_message",
  description: "Send a message to a user",
  parameters: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    priority: z.number().optional(),
    tags: z.array(z.string()).optional(),
  }),
};

const listFilesTool: ToolDefinition = {
  name: "list_files",
  description: "List files in a directory",
  parameters: z.object({
    directory: z.string(),
    recursive: z.boolean().optional(),
    pattern: z.string().optional(),
  }),
};

// ---- Benchmark test cases ----

export const BENCHMARK_CASES: BenchmarkCase[] = [
  // --- simple function call ---
  {
    id: "simple-01",
    category: "simple",
    description: "Clean JSON tool call",
    modelOutput: '{"name": "get_weather", "arguments": {"location": "London"}}',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "London" } }],
  },
  {
    id: "simple-02",
    category: "simple",
    description: "Tool call with optional param",
    modelOutput: '{"name": "get_weather", "arguments": {"location": "Tokyo", "units": "celsius"}}',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Tokyo", units: "celsius" } }],
  },
  {
    id: "simple-03",
    category: "simple",
    description: "Tool call with surrounding text",
    modelOutput: 'I will check the weather for you.\n{"name": "get_weather", "arguments": {"location": "Paris"}}\nLet me know if you need anything else.',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Paris" } }],
  },

  // --- nested params ---
  {
    id: "nested-01",
    category: "nested",
    description: "Tool call with nested array",
    modelOutput: '{"name": "send_message", "arguments": {"to": "alice@example.com", "subject": "Hello", "body": "Hi there!", "tags": ["urgent", "follow-up"]}}',
    tools: [sendMessageTool],
    expected: [{ name: "send_message", arguments: { to: "alice@example.com", subject: "Hello", body: "Hi there!", tags: ["urgent", "follow-up"] } }],
  },
  {
    id: "nested-02",
    category: "nested",
    description: "Nested with optional fields omitted",
    modelOutput: '{"name": "send_message", "arguments": {"to": "bob@example.com", "subject": "Test", "body": "Testing"}}',
    tools: [sendMessageTool],
    expected: [{ name: "send_message", arguments: { to: "bob@example.com", subject: "Test", body: "Testing" } }],
  },

  // --- multi-tool ---
  {
    id: "multi-01",
    category: "multi-tool",
    description: "Array of two tool calls",
    modelOutput: '[{"name": "get_weather", "arguments": {"location": "London"}}, {"name": "search", "arguments": {"query": "London restaurants"}}]',
    tools: [weatherTool, searchTool],
    expected: [
      { name: "get_weather", arguments: { location: "London" } },
      { name: "search", arguments: { query: "London restaurants" } },
    ],
  },
  {
    id: "multi-02",
    category: "multi-tool",
    description: "Two tool calls in markdown blocks",
    modelOutput: 'First, get weather:\n```json\n{"name": "get_weather", "arguments": {"location": "NYC"}}\n```\nThen search:\n```json\n{"name": "search", "arguments": {"query": "NYC events"}}\n```',
    tools: [weatherTool, searchTool],
    expected: [
      { name: "get_weather", arguments: { location: "NYC" } },
      { name: "search", arguments: { query: "NYC events" } },
    ],
  },

  // --- missing params (should still parse, just with fewer fields) ---
  {
    id: "missing-01",
    category: "missing-params",
    description: "Missing optional params",
    modelOutput: '{"name": "list_files", "arguments": {"directory": "/home"}}',
    tools: [listFilesTool],
    expected: [{ name: "list_files", arguments: { directory: "/home" } }],
  },

  // --- wrong types (coercion needed) ---
  {
    id: "types-01",
    category: "wrong-types",
    description: "String number needs coercion to number",
    modelOutput: '{"name": "search", "arguments": {"query": "restaurants", "maxResults": "10"}}',
    tools: [searchTool],
    expected: [{ name: "search", arguments: { query: "restaurants", maxResults: 10 } }],
  },
  {
    id: "types-02",
    category: "wrong-types",
    description: "String boolean needs coercion",
    modelOutput: '{"name": "create_file", "arguments": {"path": "/tmp/test.txt", "content": "hello", "overwrite": "true"}}',
    tools: [createFileTool],
    expected: [{ name: "create_file", arguments: { path: "/tmp/test.txt", content: "hello", overwrite: true } }],
  },
  {
    id: "types-03",
    category: "wrong-types",
    description: "Single string needs array wrapping",
    modelOutput: '{"name": "send_message", "arguments": {"to": "x@y.com", "subject": "Hi", "body": "Hey", "tags": "urgent"}}',
    tools: [sendMessageTool],
    expected: [{ name: "send_message", arguments: { to: "x@y.com", subject: "Hi", body: "Hey", tags: ["urgent"] } }],
  },
  {
    id: "types-04",
    category: "wrong-types",
    description: "Priority as string number",
    modelOutput: '{"name": "send_message", "arguments": {"to": "z@w.com", "subject": "A", "body": "B", "priority": "5"}}',
    tools: [sendMessageTool],
    expected: [{ name: "send_message", arguments: { to: "z@w.com", subject: "A", body: "B", priority: 5 } }],
  },
  {
    id: "types-05",
    category: "wrong-types",
    description: "Snake_case key needs camelCase normalization",
    modelOutput: '{"name": "search", "arguments": {"query": "test", "max_results": "5"}}',
    tools: [searchTool],
    expected: [{ name: "search", arguments: { query: "test", maxResults: 5 } }],
  },

  // --- malformed JSON ---
  {
    id: "malformed-01",
    category: "malformed",
    description: "Trailing comma in object",
    modelOutput: '{"name": "get_weather", "arguments": {"location": "Berlin",}}',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Berlin" } }],
  },
  {
    id: "malformed-02",
    category: "malformed",
    description: "Single quotes instead of double quotes",
    modelOutput: "{'name': 'get_weather', 'arguments': {'location': 'Madrid'}}",
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Madrid" } }],
  },
  {
    id: "malformed-03",
    category: "malformed",
    description: "Unquoted keys",
    modelOutput: '{name: "get_weather", arguments: {location: "Rome"}}',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Rome" } }],
  },
  {
    id: "malformed-04",
    category: "malformed",
    description: "JSON with comments",
    modelOutput: '{\n  // Tool call\n  "name": "get_weather",\n  "arguments": {\n    "location": "Oslo" /* capital */\n  }\n}',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Oslo" } }],
  },
  {
    id: "malformed-05",
    category: "malformed",
    description: "Missing closing brace",
    modelOutput: '{"name": "get_weather", "arguments": {"location": "Vienna"}',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Vienna" } }],
  },

  // --- XML format ---
  {
    id: "xml-01",
    category: "xml",
    description: "XML tool call format",
    modelOutput: '<tool_call><name>get_weather</name><arguments>{"location": "Dublin"}</arguments></tool_call>',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Dublin" } }],
  },
  {
    id: "xml-02",
    category: "xml",
    description: "XML with surrounding text",
    modelOutput: 'Let me look that up for you.\n<tool_call>\n  <name>search</name>\n  <arguments>{"query": "best cafes"}</arguments>\n</tool_call>\nHere are the results:',
    tools: [searchTool],
    expected: [{ name: "search", arguments: { query: "best cafes" } }],
  },

  // --- Markdown format ---
  {
    id: "md-01",
    category: "markdown",
    description: "Markdown code fence wrapping",
    modelOutput: '```json\n{"name": "get_weather", "arguments": {"location": "Seoul"}}\n```',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Seoul" } }],
  },
  {
    id: "md-02",
    category: "markdown",
    description: "Markdown with explanation text",
    modelOutput: 'I\'ll check the weather:\n\n```json\n{"name": "get_weather", "arguments": {"location": "Busan", "units": "celsius"}}\n```\n\nDone!',
    tools: [weatherTool],
    expected: [{ name: "get_weather", arguments: { location: "Busan", units: "celsius" } }],
  },
];

/**
 * Check if two tool call arrays match (order-sensitive, deep equality on arguments).
 */
function toolCallsMatch(actual: ToolCall[], expected: ToolCall[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!;
    const e = expected[i]!;
    if (a.name !== e.name) return false;
    if (JSON.stringify(a.arguments) !== JSON.stringify(e.arguments)) return false;
  }
  return true;
}

/**
 * Attempt baseline parsing: strict JSON.parse only, no coercion.
 */
function baselineParse(modelOutput: string, tools: ToolDefinition[]): { calls: ToolCall[]; errors: string[] } {
  try {
    const parsed = JSON.parse(modelOutput);
    const calls: ToolCall[] = [];
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (item && typeof item.name === "string" && item.arguments) {
        calls.push({ name: item.name, arguments: item.arguments });
      }
    }
    return { calls, errors: [] };
  } catch (err) {
    return { calls: [], errors: [err instanceof Error ? err.message : String(err)] };
  }
}

/**
 * Run the full benchmark suite.
 */
export function runToolBenchmark(cases: BenchmarkCase[] = BENCHMARK_CASES): ToolBenchmarkResult {
  const results: ToolReliabilityCaseResult[] = [];
  const categories: Record<string, { baseline: number; middleware: number; total: number }> = {};

  for (const tc of cases) {
    // Baseline: strict JSON.parse
    const baseline = baselineParse(tc.modelOutput, tc.tools);
    const baselinePass = toolCallsMatch(baseline.calls, tc.expected);

    // Middleware: full robust pipeline
    const mwResult = parseToolCalls(tc.modelOutput, tc.tools);
    const middlewarePass = toolCallsMatch(mwResult.calls, tc.expected);

    results.push({
      id: tc.id,
      category: tc.category,
      baselinePass,
      middlewarePass,
      baselineErrors: baseline.errors,
      middlewareErrors: mwResult.errors,
    });

    // Update category stats
    if (!categories[tc.category]) {
      categories[tc.category] = { baseline: 0, middleware: 0, total: 0 };
    }
    categories[tc.category]!.total++;
    if (baselinePass) categories[tc.category]!.baseline++;
    if (middlewarePass) categories[tc.category]!.middleware++;
  }

  const total = results.length;
  const baselineRate = results.filter((r) => r.baselinePass).length / total;
  const middlewareRate = results.filter((r) => r.middlewarePass).length / total;

  return {
    cases: results,
    baselineRate,
    middlewareRate,
    improvement: (middlewareRate - baselineRate) * 100,
    categories,
  };
}

/**
 * Format benchmark results as a printable table.
 */
export function formatBenchmarkTable(result: ToolBenchmarkResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("  Tool Reliability Benchmark Results");
  lines.push("  ===================================");
  lines.push("");

  // Per-case results
  lines.push("  Case Results:");
  lines.push(`  ${"ID".padEnd(16)} ${"Category".padEnd(16)} ${"Baseline".padEnd(10)} ${"Middleware".padEnd(10)} ${"Description"}`);
  lines.push(`  ${"-".repeat(16)} ${"-".repeat(16)} ${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(30)}`);

  for (const c of result.cases) {
    const bl = c.baselinePass ? "PASS" : "FAIL";
    const mw = c.middlewarePass ? "PASS" : "FAIL";
    const desc = result.cases.find((x) => x.id === c.id)?.category ?? "";
    lines.push(`  ${c.id.padEnd(16)} ${c.category.padEnd(16)} ${bl.padEnd(10)} ${mw.padEnd(10)}`);
  }

  lines.push("");

  // Category summary
  lines.push("  Category Summary:");
  lines.push(`  ${"Category".padEnd(18)} ${"Baseline".padEnd(14)} ${"Middleware".padEnd(14)} ${"Delta"}`);
  lines.push(`  ${"-".repeat(18)} ${"-".repeat(14)} ${"-".repeat(14)} ${"-".repeat(10)}`);

  for (const [cat, stats] of Object.entries(result.categories)) {
    const blPct = ((stats.baseline / stats.total) * 100).toFixed(0);
    const mwPct = ((stats.middleware / stats.total) * 100).toFixed(0);
    const delta = (((stats.middleware - stats.baseline) / stats.total) * 100).toFixed(0);
    lines.push(
      `  ${cat.padEnd(18)} ${`${stats.baseline}/${stats.total} (${blPct}%)`.padEnd(14)} ${`${stats.middleware}/${stats.total} (${mwPct}%)`.padEnd(14)} +${delta}%`,
    );
  }

  lines.push("");

  // Overall
  lines.push("  Overall:");
  lines.push(`    Baseline success rate:   ${(result.baselineRate * 100).toFixed(1)}%`);
  lines.push(`    Middleware success rate:  ${(result.middlewareRate * 100).toFixed(1)}%`);
  lines.push(`    Improvement:             +${result.improvement.toFixed(1)} percentage points`);
  lines.push("");

  return lines.join("\n");
}
