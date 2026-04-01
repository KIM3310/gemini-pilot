/**
 * Team coordinator: manages multi-agent parallel execution via tmux.
 *
 * Provides tmux session management, worker pane creation, task queuing,
 * and phase-based orchestration for team mode.
 *
 * @module team/coordinator
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { GeminiPilotConfig } from "../config/schema.js";
import type { AgentDefinition } from "../agents/registry.js";
import { StateManager, type TeamState } from "../state/index.js";
import { createLogger } from "../utils/logger.js";
import { ensureGeminiInstalled } from "../harness/session.js";

const log = createLogger("team");

export interface TeamOptions {
  workerCount: number;
  role?: string;
  projectRoot?: string;
}

export interface WorkerInfo {
  id: string;
  role: string;
  tmuxPane: string;
  process?: ChildProcess;
}

/**
 * Check if a command is available on the system (cross-platform).
 */
function commandExists(cmd: string): boolean {
  try {
    const checkCmd = process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if tmux is available on the system.
 */
export function isTmuxAvailable(): boolean {
  return commandExists("tmux");
}

/**
 * Check if we are inside a tmux session.
 */
export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * Create a tmux session for team coordination.
 */
export function createTmuxSession(sessionName: string): boolean {
  try {
    execSync(`tmux new-session -d -s "${sessionName}"`, { stdio: "pipe" });
    log.info(`Created tmux session: ${sessionName}`);
    return true;
  } catch (err) {
    log.error("Failed to create tmux session", err);
    return false;
  }
}

/**
 * Create a new pane in a tmux session.
 */
export function createTmuxPane(sessionName: string): string | undefined {
  try {
    const result = execSync(
      `tmux split-window -t "${sessionName}" -P -F "#{pane_id}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    const paneId = result.trim();
    log.debug(`Created tmux pane: ${paneId}`);
    return paneId;
  } catch (err) {
    log.error("Failed to create tmux pane", err);
    return undefined;
  }
}

/**
 * Send a command to a tmux pane.
 */
export function sendToTmuxPane(paneId: string, command: string): void {
  try {
    // Use -- to prevent argument injection via paneId and pass command safely
    const escaped = command.replace(/'/g, "'\\''");
    execSync(`tmux send-keys -t '${paneId}' '${escaped}' Enter`, { stdio: "pipe" });
  } catch (err) {
    log.error(`Failed to send command to pane ${paneId}`, err);
  }
}

/**
 * Kill a tmux session.
 */
export function killTmuxSession(sessionName: string): void {
  try {
    execSync(`tmux kill-session -t "${sessionName}"`, { stdio: "pipe" });
    log.info(`Killed tmux session: ${sessionName}`);
  } catch {
    // Session may already be gone
  }
}

/**
 * Initialize team state.
 */
export function initTeamState(options: TeamOptions): TeamState {
  return {
    id: randomUUID().slice(0, 8),
    workerCount: options.workerCount,
    workers: Array.from({ length: options.workerCount }, (_, i) => ({
      id: `worker-${i}`,
      role: options.role ?? "executor",
      status: "idle" as const,
    })),
    taskQueue: [],
    phase: "plan",
    startedAt: new Date().toISOString(),
  };
}

/**
 * Add a task to the team queue.
 */
export function enqueueTask(
  state: TeamState,
  description: string,
): TeamState {
  const task = {
    id: randomUUID().slice(0, 8),
    description,
    status: "pending" as const,
  };
  return {
    ...state,
    taskQueue: [...state.taskQueue, task],
  };
}

/**
 * Assign the next pending task to an idle worker.
 */
export function assignNextTask(state: TeamState): TeamState {
  const idleWorker = state.workers.find((w) => w.status === "idle");
  const pendingTask = state.taskQueue.find((t) => t.status === "pending");

  if (!idleWorker || !pendingTask) {
    return state;
  }

  return {
    ...state,
    workers: state.workers.map((w) =>
      w.id === idleWorker.id
        ? { ...w, status: "busy" as const, currentTask: pendingTask.id }
        : w,
    ),
    taskQueue: state.taskQueue.map((t) =>
      t.id === pendingTask.id
        ? { ...t, status: "assigned" as const, assignedTo: idleWorker.id }
        : t,
    ),
  };
}

/**
 * Mark a task as completed.
 */
export function completeTask(
  state: TeamState,
  taskId: string,
  result: string,
): TeamState {
  const task = state.taskQueue.find((t) => t.id === taskId);
  if (!task) return state;

  return {
    ...state,
    workers: state.workers.map((w) =>
      w.currentTask === taskId
        ? { ...w, status: "idle" as const, currentTask: undefined }
        : w,
    ),
    taskQueue: state.taskQueue.map((t) =>
      t.id === taskId
        ? { ...t, status: "done" as const, result }
        : t,
    ),
  };
}

/**
 * Advance to the next phase in the pipeline.
 */
export function advancePhase(state: TeamState): TeamState {
  const phases: TeamState["phase"][] = ["plan", "execute", "verify", "fix"];
  const currentIndex = phases.indexOf(state.phase);
  const nextPhase = phases[(currentIndex + 1) % phases.length]!;

  log.info(`Phase transition: ${state.phase} -> ${nextPhase}`);

  return {
    ...state,
    phase: nextPhase,
  };
}

/**
 * Launch team mode with tmux-based parallel execution.
 */
export function launchTeam(
  config: GeminiPilotConfig,
  options: TeamOptions,
): void {
  // Ensure gemini CLI is available before launching team
  ensureGeminiInstalled();

  if (!isTmuxAvailable()) {
    log.error("tmux is not installed. Team mode requires tmux.");
    console.error(
      "Error: tmux is required for team mode. Install it with:\n" +
      "  macOS: brew install tmux\n" +
      "  Ubuntu: sudo apt install tmux",
    );
    process.exit(1);
  }

  const teamState = initTeamState(options);
  const stateManager = new StateManager(options.projectRoot);
  stateManager.saveTeamState(teamState);

  const sessionName = `gp-team-${teamState.id}`;

  console.log(`\nLaunching team mode with ${options.workerCount} workers...`);
  console.log(`Team ID: ${teamState.id}`);
  console.log(`tmux session: ${sessionName}`);
  console.log(`Role: ${options.role ?? "executor"}`);

  const created = createTmuxSession(sessionName);
  if (!created) {
    log.error("Failed to create tmux session");
    process.exit(1);
  }

  // Create additional panes for workers and collect pane IDs
  const paneIds: string[] = [];

  // The first pane is the default pane of the session; get its ID
  try {
    const firstPane = execSync(
      `tmux list-panes -t "${sessionName}" -F "#{pane_id}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim().split("\n")[0];
    if (firstPane) paneIds.push(firstPane);
  } catch {
    // non-fatal
  }

  for (let i = 1; i < options.workerCount; i++) {
    const paneId = createTmuxPane(sessionName);
    if (paneId) paneIds.push(paneId);
  }

  // Tile the panes evenly
  try {
    execSync(`tmux select-layout -t "${sessionName}" tiled`, { stdio: "pipe" });
  } catch {
    // Layout may fail with few panes, non-fatal
  }

  // Send the harness command to each pane
  const role = options.role ?? "executor";
  for (const paneId of paneIds) {
    sendToTmuxPane(paneId, `gp harness --agent ${role}`);
  }

  console.log(`\nTeam session ready. Attach with:\n  tmux attach -t ${sessionName}\n`);
}
