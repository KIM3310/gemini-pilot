/**
 * Per-session metrics tracking.
 *
 * Tracks prompts sent, estimated token usage, elapsed wall-clock time,
 * and the model used.  Metrics are stored in-memory and can be
 * persisted alongside session state via {@link toJSON}.
 *
 * This is orthogonal to {@link state/schema.SessionMetricsSchema}, which
 * defines the persisted shape.  Use this tracker while a session is
 * running, then snapshot to the persisted schema on save.
 *
 * @module metrics/tracker
 */

/** Snapshot of session metrics at a point in time. */
export interface TrackedMetrics {
  /** Total prompts sent during this session. */
  promptsSent: number;
  /** Rough token estimate (prompt + completion). */
  estimatedTokens: number;
  /** Wall-clock milliseconds since session start. */
  elapsedMs: number;
  /** Model identifier used for the session. */
  model: string;
  /** ISO-8601 timestamp when the session started. */
  startedAt: string;
  /** Per-prompt latency samples in milliseconds. */
  latencySamples: number[];
}

/**
 * Create a new metrics tracker for one session.
 *
 * @param model - The model identifier (e.g. `"gemini-3.1-pro"` or `"qwen3-coder-plus"`).
 * @returns A {@link MetricsTracker} instance.
 */
export function createMetricsTracker(model: string): MetricsTracker {
  return new MetricsTracker(model);
}

/** Mutable tracker that accumulates metrics for a single session. */
export class MetricsTracker {
  private promptsSent = 0;
  private estimatedTokens = 0;
  private readonly startedAt: number;
  private readonly model: string;
  private readonly latencySamples: number[] = [];

  constructor(model: string) {
    this.model = model;
    this.startedAt = Date.now();
  }

  /**
   * Record that a prompt was sent.
   *
   * @param promptLength - Character count of the prompt text.
   * @param latencyMs    - Round-trip latency in milliseconds (optional).
   */
  recordPrompt(promptLength: number, latencyMs?: number): void {
    this.promptsSent++;
    // Rough token estimate: ~4 chars per token for English/code.
    this.estimatedTokens += Math.ceil(promptLength / 4);
    if (latencyMs !== undefined) {
      this.latencySamples.push(latencyMs);
    }
  }

  /**
   * Record estimated completion tokens received.
   *
   * @param outputLength - Character count of the completion.
   */
  recordCompletion(outputLength: number): void {
    this.estimatedTokens += Math.ceil(outputLength / 4);
  }

  /** Return a plain-object snapshot of all metrics. */
  toJSON(): TrackedMetrics {
    return {
      promptsSent: this.promptsSent,
      estimatedTokens: this.estimatedTokens,
      elapsedMs: Date.now() - this.startedAt,
      model: this.model,
      startedAt: new Date(this.startedAt).toISOString(),
      latencySamples: [...this.latencySamples],
    };
  }

  /** Format a human-readable summary for CLI display. */
  summary(): string {
    const m = this.toJSON();
    const elapsed = (m.elapsedMs / 1000).toFixed(1);
    const avgLatency =
      m.latencySamples.length > 0
        ? (m.latencySamples.reduce((a, b) => a + b, 0) / m.latencySamples.length).toFixed(0)
        : "n/a";
    return [
      `  Prompts sent:     ${m.promptsSent}`,
      `  Est. tokens:      ${m.estimatedTokens.toLocaleString()}`,
      `  Elapsed:          ${elapsed}s`,
      `  Model:            ${m.model}`,
      `  Avg latency:      ${avgLatency}ms`,
    ].join("\n");
  }
}
