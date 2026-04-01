/**
 * Tool Reliability Module
 *
 * Improves tool-call success rates through robust JSON parsing,
 * schema coercion, and bounded retry with error context.
 *
 * @module tool-reliability
 */

export { rjsonParse, type RJsonResult } from "./rjson.js";
export { coerceToSchema, snakeToCamel, camelToSnake, type CoerceResult } from "./schema-coerce.js";
export {
  parseToolCalls,
  type ToolCall,
  type ToolDefinition,
  type ParseResult,
} from "./parser.js";
export {
  parseWithRetry,
  buildRetryPrompt,
  createMetricsTracker,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  type RetryMetrics,
  type RetryResult,
  type RetryAggregateMetrics,
  type ModelCaller,
} from "./retry.js";
export {
  executeWithToolReliability,
  createToolReliabilityMiddleware,
  DEFAULT_TOOL_RELIABILITY_CONFIG,
  type ToolReliabilityConfig,
  type ToolCallResult,
} from "./middleware.js";
export {
  runToolBenchmark,
  formatBenchmarkTable,
  BENCHMARK_CASES,
  type BenchmarkCase,
  type ToolReliabilityCaseResult,
  type ToolBenchmarkResult,
} from "./benchmark.js";
