/**
 * Tool Reliability Middleware
 *
 * Integration layer that composes the robust parser, schema coercion,
 * and bounded retry into a single pipeline for improving tool-call
 * success rates.
 *
 * @module tool-reliability/middleware
 */

import { parseToolCalls, type ToolCall, type ToolDefinition, type ParseResult } from "./parser.js";
import { parseWithRetry, createMetricsTracker, type ModelCaller, type RetryMetrics, type RetryAggregateMetrics } from "./retry.js";

/** Configuration for the tool reliability middleware. */
export interface ToolReliabilityConfig {
  /** Maximum number of retry attempts. Default: 3. */
  maxRetries: number;
  /** Enable schema coercion on arguments. Default: true. */
  enableCoercion: boolean;
  /** Enable robust JSON parsing. Default: true. */
  enableRobustParse: boolean;
  /** Enable retry with error context. Default: true. */
  enableRetry: boolean;
}

/** Result of a tool-call extraction with reliability middleware. */
export interface ToolCallResult {
  /** Parsed tool calls. */
  calls: ToolCall[];
  /** Parse result details. */
  parseResult: ParseResult;
  /** Retry metrics (if retry was attempted). */
  retryMetrics?: RetryMetrics;
  /** Whether the middleware was involved in producing the result. */
  middlewareApplied: boolean;
}

/** Default middleware configuration. */
export const DEFAULT_TOOL_RELIABILITY_CONFIG: ToolReliabilityConfig = {
  maxRetries: 3,
  enableCoercion: true,
  enableRobustParse: true,
  enableRetry: true,
};

/**
 * Execute a model prompt with full tool reliability middleware.
 *
 * Pipeline:
 * 1. Call the model
 * 2. Parse tool calls with robust parser (if enabled)
 * 3. Coerce arguments to match schema (automatic via parser)
 * 4. If failed and retry enabled, retry with error context
 * 5. Return result with metrics
 */
export async function executeWithToolReliability(
  prompt: string,
  tools: ToolDefinition[],
  callModel: ModelCaller,
  config: ToolReliabilityConfig = DEFAULT_TOOL_RELIABILITY_CONFIG,
): Promise<ToolCallResult> {
  // Step 1: Call the model
  let modelOutput: string;
  try {
    modelOutput = await callModel(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      calls: [],
      parseResult: { calls: [], errors: [`Model call failed: ${msg}`], coercions: [], format: "unknown" },
      middlewareApplied: true,
    };
  }

  // Step 2 & 3: Parse with robust parser + schema coercion
  const toolsForParse = config.enableCoercion ? tools : undefined;
  const parseResult: ParseResult = parseToolCalls(modelOutput, toolsForParse);

  if (parseResult.calls.length > 0) {
    return {
      calls: parseResult.calls,
      parseResult,
      middlewareApplied: parseResult.coercions.length > 0,
    };
  }

  // Step 4: Retry if enabled
  if (config.enableRetry && config.maxRetries > 0) {
    const retryResult = await parseWithRetry(
      modelOutput,
      tools,
      callModel,
      prompt,
      {
        maxRetries: config.maxRetries,
        baseDelayMs: 100,
        maxDelayMs: 5000,
      },
    );

    return {
      calls: retryResult.calls,
      parseResult: retryResult.parseResult,
      retryMetrics: retryResult.metrics,
      middlewareApplied: true,
    };
  }

  // No retry, return failure
  return {
    calls: [],
    parseResult,
    middlewareApplied: config.enableRobustParse || config.enableCoercion,
  };
}

/**
 * Create a standalone tool reliability middleware instance that tracks aggregate metrics.
 */
export function createToolReliabilityMiddleware(config: ToolReliabilityConfig = DEFAULT_TOOL_RELIABILITY_CONFIG) {
  const tracker = createMetricsTracker();

  return {
    /**
     * Execute a prompt with full tool reliability pipeline.
     */
    async execute(
      prompt: string,
      tools: ToolDefinition[],
      callModel: ModelCaller,
    ): Promise<ToolCallResult> {
      const result = await executeWithToolReliability(prompt, tools, callModel, config);
      if (result.retryMetrics) {
        tracker.record(result.retryMetrics);
      }
      return result;
    },

    /**
     * Parse tool calls from existing model output (no model call).
     */
    parse(text: string, tools?: ToolDefinition[]): ParseResult {
      return parseToolCalls(text, tools);
    },

    /**
     * Get aggregate metrics across all invocations.
     */
    getMetrics(): RetryAggregateMetrics {
      return tracker.getAggregate();
    },

    /** The configuration in use. */
    config,
  };
}
