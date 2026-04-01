/**
 * Session harness: manages Gemini CLI sessions with model routing,
 * approval modes, context injection, recording, and metrics tracking.
 *
 * @module harness/session
 */

import { execSync, execFileSync, spawnSync, type ExecSyncOptions } from "node:child_process";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import type { GeminiPilotConfig, ModelTier, ApprovalMode } from "../config/schema.js";
import type { AgentDefinition } from "../agents/registry.js";
import { StateManager, type SessionState, type SessionMetrics } from "../state/index.js";
import { createLogger } from "../utils/logger.js";
import { readTextFile, findProjectRoot } from "../utils/fs.js";
import { hooks } from "../hooks/index.js";
import { formatError } from "../errors/index.js";

const log = createLogger("harness");

/**
 * Check whether the `gemini` CLI binary is available on $PATH.
 *
 * @returns true when the binary is found
 */
export function isGeminiInstalled(): boolean {
  try {
    const checkCmd = process.platform === "win32" ? "where gemini" : "which gemini";
    execSync(checkCmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Abort with a clear error message when the Gemini CLI is not installed.
 *
 * Call this at the top of every execution path that needs the binary.
 */
export function ensureGeminiInstalled(): void {
  if (!isGeminiInstalled()) {
    console.error(
      "Error: Gemini CLI not found. Install it with: npm install -g @google/gemini-cli",
    );
    process.exit(1);
  }
}

/** Options for launching a Gemini CLI session. */
export interface SessionOptions {
  /** Model quality tier. */
  tier: ModelTier;
  /** Tool-approval behavior. */
  approvalMode: ApprovalMode;
  /** Optional agent role to assume. */
  agent?: AgentDefinition;
  /** Raw AGENTS.md contract text. */
  agentsContract?: string;
  /** Override project root directory. */
  projectRoot?: string;
  /** When true, print what would execute without running Gemini CLI. */
  dryRun?: boolean;
}

/**
 * Build the system prompt for a session from available context.
 *
 * @param options - Context sources to incorporate
 * @returns Combined system prompt string
 */
export function buildSystemPrompt(options: {
  agent?: AgentDefinition;
  agentsContract?: string;
  projectMemory?: string;
  workflowContext?: string;
}): string {
  const parts: string[] = [];

  if (options.agentsContract) {
    parts.push("# Orchestration Contract\n\n" + options.agentsContract);
  }

  if (options.agent) {
    parts.push("# Your Role\n\n" + options.agent.systemPrompt);
  }

  if (options.projectMemory) {
    parts.push("# Project Memory\n\n" + options.projectMemory);
  }

  if (options.workflowContext) {
    parts.push("# Active Workflow\n\n" + options.workflowContext);
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Resolve the model identifier for a given tier.
 *
 * @param config - Gemini Pilot configuration
 * @param tier - Desired model quality tier
 * @returns Model identifier string (e.g. "gemini-2.5-pro")
 */
export function resolveModel(config: GeminiPilotConfig, tier: ModelTier): string {
  return config.models[tier];
}

/**
 * Build the Gemini CLI command arguments.
 *
 * @param options - Argument building options
 * @returns Array of CLI argument strings
 */
export function buildGeminiArgs(options: {
  model: string;
  systemPrompt?: string;
  approvalMode: ApprovalMode;
  prompt?: string;
}): string[] {
  const args: string[] = [];

  args.push("--model", options.model);

  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }

  // Map approval mode to sandbox/yolo flags
  if (options.approvalMode === "yolo") {
    args.push("--sandbox=false");
  }

  if (options.prompt) {
    args.push(options.prompt);
  }

  return args;
}

/**
 * Estimate token count from a text string using a rough 4-chars-per-token heuristic.
 *
 * @param text - Input text
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Print a dry-run summary of what a session or command would do, without executing.
 *
 * @param command - Full command that would be executed
 * @param model - Selected model identifier
 * @param tier - Selected tier
 * @param approvalMode - Approval mode
 * @param agent - Optional agent name
 * @param env - Optional environment variable overrides
 */
export function printDryRun(options: {
  command: string;
  model: string;
  tier: ModelTier;
  approvalMode: ApprovalMode;
  agent?: string;
  env?: Record<string, string>;
}): void {
  console.log("\n  [DRY RUN] The following would be executed:\n");
  console.log(`  Command:       ${options.command}`);
  console.log(`  Model:         ${options.model}`);
  console.log(`  Tier:          ${options.tier}`);
  console.log(`  Approval Mode: ${options.approvalMode}`);
  if (options.agent) {
    console.log(`  Agent:         ${options.agent}`);
  }
  if (options.env && Object.keys(options.env).length > 0) {
    console.log("  Environment:");
    for (const [k, v] of Object.entries(options.env)) {
      console.log(`    ${k}=${v}`);
    }
  }
  console.log("\n  No action taken (--dry-run mode).\n");
}

/**
 * Create a new session and return its state.
 *
 * @param config - Gemini Pilot configuration
 * @param options - Session launch options
 * @returns The newly created session state
 */
export function createSession(
  config: GeminiPilotConfig,
  options: SessionOptions,
): SessionState {
  const model = resolveModel(config, options.tier);
  const session: SessionState = {
    id: randomUUID().slice(0, 8),
    startedAt: new Date().toISOString(),
    agent: options.agent?.name,
    tier: options.tier,
    approvalMode: options.approvalMode,
    turns: 0,
    status: "active",
    metrics: {
      promptsSent: 0,
      estimatedTokens: 0,
      elapsedMs: 0,
      modelUsed: model,
    },
  };

  const stateManager = new StateManager(options.projectRoot);
  stateManager.saveSession(session);

  log.info(
    `Session ${session.id} created (tier=${options.tier}, approval=${options.approvalMode})`,
  );

  return session;
}

/**
 * Launch an interactive Gemini CLI session.
 *
 * When `options.dryRun` is true the command is printed but not executed.
 *
 * @param config - Gemini Pilot configuration
 * @param options - Session launch options
 */
export function launchSession(
  config: GeminiPilotConfig,
  options: SessionOptions,
): void {
  const model = resolveModel(config, options.tier);
  const projectRoot = options.projectRoot ?? findProjectRoot();

  // Build system prompt with context injection
  const agentsContract =
    options.agentsContract ??
    readTextFile(path.join(projectRoot, "AGENTS.md"));

  const stateManager = new StateManager(projectRoot);
  const memory = stateManager.loadMemory();
  const memoryText = memory.notes.length > 0
    ? JSON.stringify(memory, null, 2)
    : undefined;

  const systemPrompt = buildSystemPrompt({
    agent: options.agent,
    agentsContract,
    projectMemory: memoryText,
  });

  const args = buildGeminiArgs({
    model,
    systemPrompt: systemPrompt || undefined,
    approvalMode: options.approvalMode,
  });

  const fullCommand = `gemini ${args.join(" ")}`;

  // Dry-run mode: show what would happen and exit
  if (options.dryRun) {
    printDryRun({
      command: fullCommand,
      model,
      tier: options.tier,
      approvalMode: options.approvalMode,
      agent: options.agent?.name,
    });
    return;
  }

  // Ensure gemini CLI is available before attempting to launch
  ensureGeminiInstalled();

  const session = createSession(config, options);

  log.info(`Launching Gemini CLI: ${fullCommand}`);
  log.info(`Model: ${model} | Agent: ${options.agent?.name ?? "none"}`);

  hooks.emit("session-start", {
    sessionId: session.id,
    tier: options.tier,
    agent: options.agent?.name,
    approvalMode: options.approvalMode,
  });

  const startTime = Date.now();

  // Use spawn with stdio: 'inherit' for a fully interactive session
  // (supports stdin/stdout/stderr passthrough to the terminal)
  const child = spawn("gemini", args, {
    stdio: "inherit",
    cwd: projectRoot,
    env: { ...process.env },
  });

  child.on("close", (code) => {
    const elapsed = Date.now() - startTime;

    if (code === 0 || code === null) {
      session.status = "completed";
      session.endedAt = new Date().toISOString();
      session.metrics = {
        ...session.metrics!,
        elapsedMs: elapsed,
      };
      stateManager.saveSession(session);

      hooks.emit("session-end", {
        sessionId: session.id,
        status: "completed",
      });
    } else {
      session.status = "error";
      session.endedAt = new Date().toISOString();
      session.metrics = {
        ...session.metrics!,
        elapsedMs: elapsed,
      };
      stateManager.saveSession(session);

      hooks.emit("error", {
        sessionId: session.id,
        error: `Process exited with code ${code}`,
      });

      log.error(`Session ended with exit code ${code}`);
    }
  });

  child.on("error", (err) => {
    const elapsed = Date.now() - startTime;
    session.status = "error";
    session.endedAt = new Date().toISOString();
    session.metrics = {
      ...session.metrics!,
      elapsedMs: elapsed,
    };
    stateManager.saveSession(session);

    hooks.emit("error", {
      sessionId: session.id,
      error: err.message,
    });

    log.error("Session ended with error", err);
  });
}

/**
 * Execute a single-shot prompt against Gemini CLI.
 *
 * When `dryRun` is true the command is printed and the string
 * `"[DRY RUN] No output"` is returned.
 *
 * @param config - Gemini Pilot configuration
 * @param prompt - The prompt text
 * @param tier - Model quality tier
 * @param dryRun - If true, do not execute
 * @returns The model response text
 */
export function executePrompt(
  config: GeminiPilotConfig,
  prompt: string,
  tier: ModelTier = "fast",
  dryRun = false,
): string {
  const model = resolveModel(config, tier);
  const args = buildGeminiArgs({
    model,
    approvalMode: "auto",
  });

  args.push(prompt);

  const fullCommand = `gemini ${args.join(" ")}`;

  if (dryRun) {
    printDryRun({
      command: fullCommand,
      model,
      tier,
      approvalMode: "auto",
    });
    return "[DRY RUN] No output";
  }

  // Ensure gemini CLI is available
  ensureGeminiInstalled();

  try {
    const result = execFileSync("gemini", args, {
      encoding: "utf-8",
      timeout: 60000,
      stdio: ["pipe", "pipe", "inherit"],
    });
    return result.trim();
  } catch (err) {
    log.error("Prompt execution failed", err);
    throw new Error(formatError("GP_030"));
  }
}
