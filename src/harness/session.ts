/**
 * Session harness: manages Gemini CLI sessions with model routing,
 * approval modes, context injection, and recording.
 */

import { execSync, execFileSync, type ExecSyncOptions } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import type { GeminiPilotConfig, ModelTier, ApprovalMode } from "../config/schema.js";
import type { AgentDefinition } from "../agents/registry.js";
import { StateManager, type SessionState } from "../state/index.js";
import { createLogger } from "../utils/logger.js";
import { readTextFile, findProjectRoot } from "../utils/fs.js";
import { hooks } from "../hooks/index.js";

const log = createLogger("harness");

export interface SessionOptions {
  tier: ModelTier;
  approvalMode: ApprovalMode;
  agent?: AgentDefinition;
  agentsContract?: string;
  projectRoot?: string;
}

export interface SessionMetrics {
  startTime: number;
  turns: number;
  duration: number;
}

/**
 * Build the system prompt for a session from available context.
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
 */
export function resolveModel(config: GeminiPilotConfig, tier: ModelTier): string {
  return config.models[tier];
}

/**
 * Build the Gemini CLI command arguments.
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
 * Create a new session and return its state.
 */
export function createSession(
  config: GeminiPilotConfig,
  options: SessionOptions,
): SessionState {
  const session: SessionState = {
    id: randomUUID().slice(0, 8),
    startedAt: new Date().toISOString(),
    agent: options.agent?.name,
    tier: options.tier,
    approvalMode: options.approvalMode,
    turns: 0,
    status: "active",
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

  const session = createSession(config, options);

  const args = buildGeminiArgs({
    model,
    systemPrompt: systemPrompt || undefined,
    approvalMode: options.approvalMode,
  });

  log.info(`Launching Gemini CLI: gemini ${args.join(" ")}`);
  log.info(`Model: ${model} | Agent: ${options.agent?.name ?? "none"}`);

  hooks.emit("session-start", {
    sessionId: session.id,
    tier: options.tier,
    agent: options.agent?.name,
    approvalMode: options.approvalMode,
  });

  try {
    const execOpts: ExecSyncOptions = {
      stdio: "inherit",
      cwd: projectRoot,
      env: { ...process.env },
    };

    execSync(`gemini ${args.join(" ")}`, execOpts);

    // Mark session complete
    session.status = "completed";
    session.endedAt = new Date().toISOString();
    stateManager.saveSession(session);

    hooks.emit("session-end", {
      sessionId: session.id,
      status: "completed",
    });
  } catch (err) {
    session.status = "error";
    session.endedAt = new Date().toISOString();
    stateManager.saveSession(session);

    hooks.emit("error", {
      sessionId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });

    log.error("Session ended with error", err);
  }
}

/**
 * Execute a single-shot prompt.
 */
export function executePrompt(
  config: GeminiPilotConfig,
  prompt: string,
  tier: ModelTier = "fast",
): string {
  const model = resolveModel(config, tier);
  const args = buildGeminiArgs({
    model,
    approvalMode: "auto",
  });

  // Pass prompt as a separate argument to avoid shell injection
  args.push(prompt);

  try {
    const result = execFileSync("gemini", args, {
      encoding: "utf-8",
      timeout: 60000,
    });
    return result.trim();
  } catch (err) {
    log.error("Prompt execution failed", err);
    throw new Error("Failed to execute prompt via Gemini CLI");
  }
}
