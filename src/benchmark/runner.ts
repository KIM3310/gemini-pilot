/**
 * Benchmark runner: executes the same prompt across all model tiers
 * and compares response time.
 *
 * @module benchmark/runner
 */

import { execFileSync } from "node:child_process";
import type { GeminiPilotConfig, ModelTier } from "../config/schema.js";
import { resolveModel, buildGeminiArgs, printDryRun, ensureGeminiInstalled } from "../harness/session.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("benchmark");

/** Tiers to include in the benchmark. */
const BENCHMARK_TIERS: ModelTier[] = ["high", "balanced", "fast"];

/** Result from a single tier's benchmark run. */
export interface BenchmarkTierResult {
  /** Model tier. */
  tier: ModelTier;
  /** Resolved model identifier. */
  model: string;
  /** Response time in milliseconds. */
  elapsedMs: number;
  /** Number of characters in the response. */
  responseLength: number;
  /** Whether execution succeeded. */
  success: boolean;
  /** Error message if execution failed. */
  error?: string;
}

/** Aggregate benchmark result. */
export interface BenchmarkResult {
  /** The prompt used for benchmarking. */
  prompt: string;
  /** Per-tier results. */
  tiers: BenchmarkTierResult[];
}

/**
 * Run a benchmark by sending the same prompt to all three model tiers.
 *
 * @param config - Gemini Pilot configuration
 * @param prompt - The prompt to benchmark
 * @param dryRun - When true, print commands without executing
 * @returns Benchmark result
 */
export function runBenchmark(
  config: GeminiPilotConfig,
  prompt: string,
  dryRun = false,
): BenchmarkResult {
  const result: BenchmarkResult = { prompt, tiers: [] };

  console.log("\n  Gemini Pilot Benchmark\n");
  console.log(`  Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"\n`);

  if (dryRun) {
    for (const tier of BENCHMARK_TIERS) {
      const model = resolveModel(config, tier);
      const args = buildGeminiArgs({ model, approvalMode: "auto" });
      args.push(prompt);
      printDryRun({
        command: `gemini ${args.join(" ")}`,
        model,
        tier,
        approvalMode: "auto",
      });
      result.tiers.push({
        tier,
        model,
        elapsedMs: 0,
        responseLength: 0,
        success: true,
      });
    }
    return result;
  }

  // Ensure gemini CLI is available before running benchmarks
  ensureGeminiInstalled();

  for (const tier of BENCHMARK_TIERS) {
    const model = resolveModel(config, tier);
    const args = buildGeminiArgs({ model, approvalMode: "auto" });
    args.push(prompt);

    console.log(`  Running ${tier.padEnd(10)} (${model})...`);

    const start = Date.now();
    let response = "";
    let success = true;
    let error: string | undefined;

    try {
      response = execFileSync("gemini", args, {
        encoding: "utf-8",
        timeout: 120000,
        stdio: ["pipe", "pipe", "inherit"],
      }).trim();
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      log.error(`Benchmark failed for tier ${tier}`, err);
    }

    const elapsed = Date.now() - start;

    result.tiers.push({
      tier,
      model,
      elapsedMs: elapsed,
      responseLength: response.length,
      success,
      error,
    });
  }

  return result;
}

/**
 * Print a benchmark result as a comparison table.
 *
 * @param result - The benchmark result to display
 */
export function printBenchmarkTable(result: BenchmarkResult): void {
  console.log("\n  Benchmark Results\n");
  console.log(
    `  ${"Tier".padEnd(12)} ${"Model".padEnd(24)} ${"Time".padEnd(10)} ${"Chars".padEnd(10)} ${"Status"}`,
  );
  console.log(`  ${"---".padEnd(12)} ${"---".padEnd(24)} ${"---".padEnd(10)} ${"---".padEnd(10)} ${"---"}`);

  for (const t of result.tiers) {
    const time = t.success ? `${t.elapsedMs}ms` : "N/A";
    const chars = t.success ? String(t.responseLength) : "N/A";
    const status = t.success ? "OK" : `FAIL: ${t.error?.slice(0, 30) ?? "unknown"}`;
    console.log(
      `  ${t.tier.padEnd(12)} ${t.model.padEnd(24)} ${time.padEnd(10)} ${chars.padEnd(10)} ${status}`,
    );
  }

  // Show winner
  const successful = result.tiers.filter((t) => t.success);
  if (successful.length > 0) {
    const fastest = successful.reduce((a, b) => (a.elapsedMs < b.elapsedMs ? a : b));
    console.log(`\n  Fastest: ${fastest.tier} (${fastest.model}) at ${fastest.elapsedMs}ms\n`);
  }
}
