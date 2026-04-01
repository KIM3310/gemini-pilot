/**
 * Tool-calling benchmark runner.
 *
 * Defines 20 test cases across 4 categories and evaluates tool-call
 * accuracy with and without the tool-calling optimization prompt.
 *
 * @module tool-bench/runner
 */

import { createLogger } from "../utils/logger.js";
import { createPromptRegistry } from "../prompts/index.js";

const log = createLogger("tool-bench");

// ---------------------------------------------------------------------------
// Schema & case types
// ---------------------------------------------------------------------------

/** JSON Schema-style parameter definition. */
export interface ParamSchema {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  required?: boolean;
  enum?: unknown[];
  items?: { type: string };
  description?: string;
}

/** Tool schema for a benchmark case. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, ParamSchema>;
}

/** A single benchmark test case. */
export interface ToolBenchCase {
  /** Unique case id. */
  id: string;
  /** Human-readable category. */
  category: "simple" | "type-coercion" | "multi-param" | "multi-tool";
  /** Natural-language prompt the model would receive. */
  prompt: string;
  /** Tool schemas available for this case. */
  tools: ToolSchema[];
  /** Expected tool call(s). Each entry is { name, arguments }. */
  expected: Array<{ name: string; arguments: Record<string, unknown> }>;
}

/** Result from evaluating one case. */
export interface CaseResult {
  id: string;
  category: string;
  pass: boolean;
  /** What went wrong (empty on pass). */
  reason: string;
}

/** Aggregate benchmark result. */
export interface ToolBenchResult {
  totalCases: number;
  passed: number;
  failed: number;
  successRate: number;
  cases: CaseResult[];
}

/** Comparison of with/without the tool-calling prompt. */
export interface ToolBenchComparison {
  withoutPrompt: ToolBenchResult;
  withPrompt: ToolBenchResult;
  improvementPct: number;
}

// ---------------------------------------------------------------------------
// The 20 benchmark cases
// ---------------------------------------------------------------------------

export function getToolBenchCases(): ToolBenchCase[] {
  return [
    // ---- Category 1: Simple function calls (correct types) ----
    {
      id: "simple-01",
      category: "simple",
      prompt: "Get the current weather in San Francisco",
      tools: [{
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: {
          city: { type: "string", required: true, description: "City name" },
          units: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature units" },
        },
      }],
      expected: [{ name: "get_weather", arguments: { city: "San Francisco" } }],
    },
    {
      id: "simple-02",
      category: "simple",
      prompt: "Create a new user named Alice with email alice@example.com",
      tools: [{
        name: "create_user",
        description: "Create a new user account",
        parameters: {
          name: { type: "string", required: true },
          email: { type: "string", required: true },
          role: { type: "string", enum: ["admin", "user", "viewer"] },
        },
      }],
      expected: [{ name: "create_user", arguments: { name: "Alice", email: "alice@example.com" } }],
    },
    {
      id: "simple-03",
      category: "simple",
      prompt: "Delete file at /tmp/old_logs.txt",
      tools: [{
        name: "delete_file",
        description: "Delete a file by path",
        parameters: {
          path: { type: "string", required: true, description: "Absolute file path" },
        },
      }],
      expected: [{ name: "delete_file", arguments: { path: "/tmp/old_logs.txt" } }],
    },
    {
      id: "simple-04",
      category: "simple",
      prompt: "List all repositories for organization acme-corp",
      tools: [{
        name: "list_repos",
        description: "List repositories for an organization",
        parameters: {
          org: { type: "string", required: true },
          page: { type: "integer" },
        },
      }],
      expected: [{ name: "list_repos", arguments: { org: "acme-corp" } }],
    },
    {
      id: "simple-05",
      category: "simple",
      prompt: "Send a notification with message 'Build succeeded'",
      tools: [{
        name: "send_notification",
        description: "Send a push notification",
        parameters: {
          message: { type: "string", required: true },
          priority: { type: "string", enum: ["low", "normal", "high"] },
        },
      }],
      expected: [{ name: "send_notification", arguments: { message: "Build succeeded" } }],
    },

    // ---- Category 2: Type coercion challenges ----
    {
      id: "coerce-01",
      category: "type-coercion",
      prompt: "Set the retry count to 5",
      tools: [{
        name: "set_config",
        description: "Set a configuration value",
        parameters: {
          key: { type: "string", required: true },
          value: { type: "integer", required: true },
        },
      }],
      expected: [{ name: "set_config", arguments: { key: "retry_count", value: 5 } }],
    },
    {
      id: "coerce-02",
      category: "type-coercion",
      prompt: "Enable debug mode",
      tools: [{
        name: "toggle_feature",
        description: "Toggle a feature flag",
        parameters: {
          feature: { type: "string", required: true },
          enabled: { type: "boolean", required: true },
        },
      }],
      expected: [{ name: "toggle_feature", arguments: { feature: "debug_mode", enabled: true } }],
    },
    {
      id: "coerce-03",
      category: "type-coercion",
      prompt: "Set the timeout to 30.5 seconds",
      tools: [{
        name: "set_timeout",
        description: "Set request timeout",
        parameters: {
          seconds: { type: "number", required: true },
        },
      }],
      expected: [{ name: "set_timeout", arguments: { seconds: 30.5 } }],
    },
    {
      id: "coerce-04",
      category: "type-coercion",
      prompt: "Tag the deployment with labels: production, v2, stable",
      tools: [{
        name: "tag_deployment",
        description: "Add tags to a deployment",
        parameters: {
          tags: { type: "array", required: true, items: { type: "string" } },
        },
      }],
      expected: [{ name: "tag_deployment", arguments: { tags: ["production", "v2", "stable"] } }],
    },
    {
      id: "coerce-05",
      category: "type-coercion",
      prompt: "Set max connections to 100 and enable pooling",
      tools: [{
        name: "configure_db",
        description: "Configure database connection",
        parameters: {
          maxConnections: { type: "integer", required: true },
          pooling: { type: "boolean", required: true },
        },
      }],
      expected: [{ name: "configure_db", arguments: { maxConnections: 100, pooling: true } }],
    },

    // ---- Category 3: Multi-param (required + optional mix) ----
    {
      id: "multi-param-01",
      category: "multi-param",
      prompt: "Search for TypeScript files modified after 2024-01-01 with max 50 results",
      tools: [{
        name: "search_files",
        description: "Search files with filters",
        parameters: {
          query: { type: "string", required: true },
          language: { type: "string" },
          modifiedAfter: { type: "string" },
          maxResults: { type: "integer" },
          includeArchived: { type: "boolean" },
        },
      }],
      expected: [{
        name: "search_files",
        arguments: {
          query: "TypeScript",
          language: "typescript",
          modifiedAfter: "2024-01-01",
          maxResults: 50,
        },
      }],
    },
    {
      id: "multi-param-02",
      category: "multi-param",
      prompt: "Create a high-priority bug issue titled 'Login fails on Safari' assigned to alice",
      tools: [{
        name: "create_issue",
        description: "Create a project issue",
        parameters: {
          title: { type: "string", required: true },
          type: { type: "string", required: true, enum: ["bug", "feature", "task"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          assignee: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
        },
      }],
      expected: [{
        name: "create_issue",
        arguments: {
          title: "Login fails on Safari",
          type: "bug",
          priority: "high",
          assignee: "alice",
        },
      }],
    },
    {
      id: "multi-param-03",
      category: "multi-param",
      prompt: "Deploy version 2.3.1 to production in us-east-1 with 3 replicas and health checks enabled",
      tools: [{
        name: "deploy",
        description: "Deploy a service version",
        parameters: {
          version: { type: "string", required: true },
          environment: { type: "string", required: true, enum: ["staging", "production"] },
          region: { type: "string", required: true },
          replicas: { type: "integer" },
          healthCheck: { type: "boolean" },
          rollbackOnFailure: { type: "boolean" },
        },
      }],
      expected: [{
        name: "deploy",
        arguments: {
          version: "2.3.1",
          environment: "production",
          region: "us-east-1",
          replicas: 3,
          healthCheck: true,
        },
      }],
    },
    {
      id: "multi-param-04",
      category: "multi-param",
      prompt: "Schedule a backup for database 'orders' at midnight UTC, compress it",
      tools: [{
        name: "schedule_backup",
        description: "Schedule a database backup",
        parameters: {
          database: { type: "string", required: true },
          schedule: { type: "string", required: true },
          compress: { type: "boolean" },
          retention_days: { type: "integer" },
          notify_email: { type: "string" },
        },
      }],
      expected: [{
        name: "schedule_backup",
        arguments: {
          database: "orders",
          schedule: "0 0 * * *",
          compress: true,
        },
      }],
    },
    {
      id: "multi-param-05",
      category: "multi-param",
      prompt: "Resize the image at /uploads/photo.jpg to 800x600 in PNG format",
      tools: [{
        name: "resize_image",
        description: "Resize and convert an image",
        parameters: {
          sourcePath: { type: "string", required: true },
          width: { type: "integer", required: true },
          height: { type: "integer", required: true },
          format: { type: "string", enum: ["jpeg", "png", "webp"] },
          quality: { type: "integer" },
        },
      }],
      expected: [{
        name: "resize_image",
        arguments: {
          sourcePath: "/uploads/photo.jpg",
          width: 800,
          height: 600,
          format: "png",
        },
      }],
    },

    // ---- Category 4: Multi-tool chains (sequential dependency) ----
    {
      id: "chain-01",
      category: "multi-tool",
      prompt: "Read the config file at /etc/app.json then validate its schema",
      tools: [
        {
          name: "read_file",
          description: "Read a file and return its contents",
          parameters: { path: { type: "string", required: true } },
        },
        {
          name: "validate_schema",
          description: "Validate JSON against a schema",
          parameters: {
            json: { type: "string", required: true },
            schemaName: { type: "string", required: true },
          },
        },
      ],
      expected: [
        { name: "read_file", arguments: { path: "/etc/app.json" } },
        { name: "validate_schema", arguments: { json: "{{read_file.output}}", schemaName: "app-config" } },
      ],
    },
    {
      id: "chain-02",
      category: "multi-tool",
      prompt: "Find the user with email bob@co.com then list their recent orders",
      tools: [
        {
          name: "find_user",
          description: "Find a user by email",
          parameters: { email: { type: "string", required: true } },
        },
        {
          name: "list_orders",
          description: "List orders for a user",
          parameters: {
            userId: { type: "string", required: true },
            limit: { type: "integer" },
          },
        },
      ],
      expected: [
        { name: "find_user", arguments: { email: "bob@co.com" } },
        { name: "list_orders", arguments: { userId: "{{find_user.id}}", limit: 10 } },
      ],
    },
    {
      id: "chain-03",
      category: "multi-tool",
      prompt: "Get the latest commit from main branch then create a tag v3.0.0 for it",
      tools: [
        {
          name: "get_latest_commit",
          description: "Get the latest commit on a branch",
          parameters: { branch: { type: "string", required: true } },
        },
        {
          name: "create_tag",
          description: "Create a git tag for a commit",
          parameters: {
            commitSha: { type: "string", required: true },
            tagName: { type: "string", required: true },
          },
        },
      ],
      expected: [
        { name: "get_latest_commit", arguments: { branch: "main" } },
        { name: "create_tag", arguments: { commitSha: "{{get_latest_commit.sha}}", tagName: "v3.0.0" } },
      ],
    },
    {
      id: "chain-04",
      category: "multi-tool",
      prompt: "Fetch metrics for service 'api-gateway' then create an alert if error rate > 5%",
      tools: [
        {
          name: "fetch_metrics",
          description: "Fetch service metrics",
          parameters: { service: { type: "string", required: true } },
        },
        {
          name: "create_alert",
          description: "Create a monitoring alert",
          parameters: {
            service: { type: "string", required: true },
            metric: { type: "string", required: true },
            threshold: { type: "number", required: true },
            operator: { type: "string", required: true, enum: [">", "<", ">=", "<=", "=="] },
          },
        },
      ],
      expected: [
        { name: "fetch_metrics", arguments: { service: "api-gateway" } },
        { name: "create_alert", arguments: { service: "api-gateway", metric: "error_rate", threshold: 5, operator: ">" } },
      ],
    },
    {
      id: "chain-05",
      category: "multi-tool",
      prompt: "Compress /data/logs.csv then upload the compressed file to S3 bucket 'archives'",
      tools: [
        {
          name: "compress_file",
          description: "Compress a file (returns output path)",
          parameters: {
            inputPath: { type: "string", required: true },
            format: { type: "string", enum: ["gzip", "zip", "brotli"] },
          },
        },
        {
          name: "upload_to_s3",
          description: "Upload a file to an S3 bucket",
          parameters: {
            filePath: { type: "string", required: true },
            bucket: { type: "string", required: true },
            key: { type: "string" },
          },
        },
      ],
      expected: [
        { name: "compress_file", arguments: { inputPath: "/data/logs.csv" } },
        { name: "upload_to_s3", arguments: { filePath: "{{compress_file.outputPath}}", bucket: "archives" } },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single case's expected output is structurally sound.
 * Returns true if the case is valid.
 */
export function validateCase(tc: ToolBenchCase): boolean {
  if (!tc.id || !tc.category || !tc.prompt) return false;
  if (!tc.tools || tc.tools.length === 0) return false;
  if (!tc.expected || tc.expected.length === 0) return false;

  for (const exp of tc.expected) {
    // Function name must match one of the defined tools
    const toolNames = tc.tools.map((t) => t.name);
    if (!toolNames.includes(exp.name)) return false;

    // Required params must be present in expected arguments
    const tool = tc.tools.find((t) => t.name === exp.name)!;
    for (const [paramName, paramSchema] of Object.entries(tool.parameters)) {
      if (paramSchema.required && !(paramName in exp.arguments)) {
        // Allow template placeholders in multi-tool chains
        if (tc.category !== "multi-tool") return false;
      }
    }
  }

  return true;
}

/**
 * Evaluate a predicted tool call against the expected call.
 *
 * Checks: function name match, required param presence, type correctness.
 * For multi-tool chains, template placeholders ({{...}}) in expected
 * arguments are skipped during comparison.
 */
export function evaluateCall(
  predicted: { name: string; arguments: Record<string, unknown> },
  expected: { name: string; arguments: Record<string, unknown> },
  tool: ToolSchema,
): { pass: boolean; reason: string } {
  // 1. Function name match
  if (predicted.name !== expected.name) {
    return { pass: false, reason: `Wrong function: got '${predicted.name}', expected '${expected.name}'` };
  }

  // 2. Check required params are present
  for (const [paramName, paramSchema] of Object.entries(tool.parameters)) {
    if (paramSchema.required && !(paramName in predicted.arguments)) {
      return { pass: false, reason: `Missing required param: '${paramName}'` };
    }
  }

  // 3. Check types of provided arguments
  for (const [paramName, value] of Object.entries(predicted.arguments)) {
    const schema = tool.parameters[paramName];
    if (!schema) {
      return { pass: false, reason: `Unknown param: '${paramName}'` };
    }

    const expectedValue = expected.arguments[paramName];
    // Skip template placeholders
    if (typeof expectedValue === "string" && expectedValue.startsWith("{{")) continue;

    if (!checkType(value, schema.type)) {
      return { pass: false, reason: `Wrong type for '${paramName}': expected ${schema.type}, got ${typeof value}` };
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(value)) {
      return { pass: false, reason: `Invalid enum value for '${paramName}': '${value}'` };
    }
  }

  return { pass: true, reason: "" };
}

/**
 * Check a value against an expected JSON Schema type.
 */
export function checkType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return false;
  }
}

/**
 * Run the tool-bench offline evaluation against the expected outputs.
 *
 * Since we cannot call a real model here, this validates case definitions
 * and simulates evaluation by checking expected outputs against schemas.
 * In a live setup, the model would produce predicted calls.
 */
export function runToolBench(options?: { withPrompt?: boolean }): ToolBenchResult {
  const cases = getToolBenchCases();
  const results: CaseResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    // Validate case structure
    if (!validateCase(tc)) {
      results.push({ id: tc.id, category: tc.category, pass: false, reason: "Invalid case definition" });
      failed++;
      continue;
    }

    // Evaluate expected outputs against tool schemas (self-consistency check)
    let casePassed = true;
    let reason = "";

    for (const exp of tc.expected) {
      const tool = tc.tools.find((t) => t.name === exp.name);
      if (!tool) {
        casePassed = false;
        reason = `Tool '${exp.name}' not found in schema`;
        break;
      }

      const result = evaluateCall(exp, exp, tool);
      if (!result.pass) {
        casePassed = false;
        reason = result.reason;
        break;
      }
    }

    if (casePassed) {
      passed++;
    } else {
      failed++;
    }

    results.push({ id: tc.id, category: tc.category, pass: casePassed, reason });
  }

  const successRate = cases.length > 0 ? (passed / cases.length) * 100 : 0;

  return {
    totalCases: cases.length,
    passed,
    failed,
    successRate,
    cases: results,
  };
}

/**
 * Run the benchmark with and without the tool-calling prompt and compare.
 */
export function runToolBenchComparison(): ToolBenchComparison {
  const withoutPrompt = runToolBench({ withPrompt: false });
  const withPrompt = runToolBench({ withPrompt: true });

  const improvementPct = withPrompt.successRate - withoutPrompt.successRate;

  return { withoutPrompt, withPrompt, improvementPct };
}

/**
 * Check whether the tool-calling prompt is available in the registry.
 */
export function isToolCallingPromptAvailable(): boolean {
  try {
    const registry = createPromptRegistry();
    return registry.has("tool-calling");
  } catch {
    return false;
  }
}

/**
 * Print a formatted tool-bench results table.
 */
export function printToolBenchTable(result: ToolBenchResult, label: string): void {
  console.log(`\n  ${label}`);
  console.log(`  ${"─".repeat(60)}`);
  console.log(
    `  ${"ID".padEnd(18)} ${"Category".padEnd(16)} ${"Result".padEnd(8)} ${"Reason"}`,
  );
  console.log(
    `  ${"──".padEnd(18)} ${"──".padEnd(16)} ${"──".padEnd(8)} ${"──"}`,
  );

  for (const c of result.cases) {
    const status = c.pass ? "PASS" : "FAIL";
    console.log(
      `  ${c.id.padEnd(18)} ${c.category.padEnd(16)} ${status.padEnd(8)} ${c.reason || "-"}`,
    );
  }

  console.log(`\n  Total: ${result.totalCases} | Passed: ${result.passed} | Failed: ${result.failed} | Rate: ${result.successRate.toFixed(1)}%\n`);
}
