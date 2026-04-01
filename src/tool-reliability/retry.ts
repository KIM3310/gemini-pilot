/**
 * Bounded Retry
 *
 * Retry tool call parsing with refined prompts on failure.
 * Features:
 * - Configurable max retries (default 3)
 * - Exponential backoff between retries
 * - Error context included in retry prompts
 * - Retry metrics tracking
 *
 * @module tool-reliability/retry
 */

import { parseToolCalls, type ToolCall, type ToolDefinition, type ParseResult } from "./parser.js";

/** Retry configuration. */
export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3. */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff. Default: 100. */
  baseDelayMs: number;
  /** Maximum delay in milliseconds. Default: 5000. */
  maxDelayMs: number;
}

/** Metrics tracked across retry attempts. */
export interface RetryMetrics {
  /** Total attempts (including initial). */
  totalAttempts: number;
  /** Whether the final result was successful. */
  succeeded: boolean;
  /** Total time spent across all attempts in ms. */
  totalTimeMs: number;
  /** Errors from each failed attempt. */
  attemptErrors: string[];
}

/** A function that calls the model with a prompt and returns raw text. */
export type ModelCaller = (prompt: string) => Promise<string>;

/** Result of a retry-aware tool call extraction. */
export interface RetryResult {
  /** Parsed tool calls (may be empty on total failure). */
  calls: ToolCall[];
  /** The full parse result from the last successful or final attempt. */
  parseResult: ParseResult;
  /** Retry metrics. */
  metrics: RetryMetrics;
}

/** Aggregate metrics across multiple retry-aware invocations. */
export interface RetryAggregateMetrics {
  /** Total number of invocations. */
  totalInvocations: number;
  /** Invocations that succeeded. */
  successfulInvocations: number;
  /** Total retry attempts across all invocations. */
  totalRetries: number;
  /** Success rate as a fraction [0, 1]. */
  successRate: number;
}

/** Default retry configuration. */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
};

/**
 * Calculate exponential backoff delay with jitter.
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  // Add 0-25% jitter
  const jitter = delay * 0.25 * Math.random();
  return delay + jitter;
}

/**
 * Wait for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a retry prompt that includes the error context from the previous attempt.
 */
export function buildRetryPrompt(
  originalPrompt: string,
  errors: string[],
  attempt: number,
): string {
  return [
    originalPrompt,
    "",
    `[RETRY ${attempt}] Your previous response could not be parsed as a valid tool call.`,
    "Errors:",
    ...errors.map((e) => `  - ${e}`),
    "",
    "Please respond with ONLY a valid JSON tool call in this exact format:",
    '{"name": "tool_name", "arguments": {"param1": "value1"}}',
    "",
    "Do not include any other text, explanations, or markdown formatting.",
  ].join("\n");
}

/**
 * Parse tool calls from model output, retrying with refined prompts on failure.
 */
export async function parseWithRetry(
  modelOutput: string,
  tools: ToolDefinition[],
  callModel: ModelCaller,
  originalPrompt: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<RetryResult> {
  const startTime = Date.now();
  const metrics: RetryMetrics = {
    totalAttempts: 0,
    succeeded: false,
    totalTimeMs: 0,
    attemptErrors: [],
  };

  // Initial attempt
  metrics.totalAttempts++;
  let parseResult = parseToolCalls(modelOutput, tools);

  if (parseResult.calls.length > 0) {
    metrics.succeeded = true;
    metrics.totalTimeMs = Date.now() - startTime;
    return { calls: parseResult.calls, parseResult, metrics };
  }

  // Retry loop
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    metrics.attemptErrors.push(...parseResult.errors);

    const delay = calculateDelay(attempt - 1, config);
    await sleep(delay);

    const retryPrompt = buildRetryPrompt(originalPrompt, parseResult.errors, attempt);

    metrics.totalAttempts++;
    let newOutput: string;
    try {
      newOutput = await callModel(retryPrompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      metrics.attemptErrors.push(`Model call failed: ${msg}`);
      continue;
    }

    parseResult = parseToolCalls(newOutput, tools);

    if (parseResult.calls.length > 0) {
      metrics.succeeded = true;
      metrics.totalTimeMs = Date.now() - startTime;
      return { calls: parseResult.calls, parseResult, metrics };
    }
  }

  // All retries exhausted
  metrics.attemptErrors.push(...parseResult.errors);
  metrics.totalTimeMs = Date.now() - startTime;
  return { calls: [], parseResult, metrics };
}

/**
 * Create a metrics tracker for aggregating retry statistics across multiple invocations.
 */
export function createMetricsTracker(): {
  record: (metrics: RetryMetrics) => void;
  getAggregate: () => RetryAggregateMetrics;
} {
  let totalInvocations = 0;
  let successfulInvocations = 0;
  let totalRetries = 0;

  return {
    record(metrics: RetryMetrics): void {
      totalInvocations++;
      if (metrics.succeeded) successfulInvocations++;
      totalRetries += metrics.totalAttempts - 1; // -1 for initial attempt
    },
    getAggregate(): RetryAggregateMetrics {
      return {
        totalInvocations,
        successfulInvocations,
        totalRetries,
        successRate: totalInvocations > 0 ? successfulInvocations / totalInvocations : 0,
      };
    },
  };
}
