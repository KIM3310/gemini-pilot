/**
 * Workflow runner: executes workflow steps sequentially by chaining
 * `gp ask` calls through the harness.
 *
 * Each step selects the agent specified in the workflow, builds the prompt
 * from the step description, executes it (or dry-runs), checks the gate
 * condition, and optionally loops back on failure.
 *
 * @module workflows/runner
 */

import type { GeminiPilotConfig } from "../config/schema.js";
import type { WorkflowDefinition, WorkflowStep } from "./engine.js";
import { executePrompt, resolveModel, printDryRun, buildGeminiArgs, ensureGeminiInstalled } from "../harness/session.js";
import { StateManager, type WorkflowState } from "../state/index.js";
import { createLogger } from "../utils/logger.js";
import { formatError } from "../errors/index.js";
import { hooks } from "../hooks/index.js";

const log = createLogger("workflow-runner");

/** Result of a single workflow step execution. */
export interface StepResult {
  /** Zero-based step index. */
  stepIndex: number;
  /** Agent that executed the step. */
  agent: string;
  /** The raw model response. */
  output: string;
  /** Whether the gate check passed. */
  gatePassed: boolean;
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
}

/** Result of an entire workflow run. */
export interface WorkflowRunResult {
  /** Workflow name. */
  workflowName: string;
  /** Per-step results. */
  steps: StepResult[];
  /** Overall status. */
  status: "completed" | "failed" | "dry-run";
  /** Total iterations consumed (including loops). */
  totalIterations: number;
  /** Total elapsed time in milliseconds. */
  totalElapsedMs: number;
}

/**
 * Evaluate a gate condition against step output.
 *
 * The gate string supports several simple patterns:
 *   - "contains:<text>" -- output must include the text
 *   - "not-empty"       -- output must be non-empty
 *   - "exit-code:0"     -- always passes (we reached here without throwing)
 *   - Any other string  -- treated as a substring check (case-insensitive)
 *
 * @param gate - Gate condition from the workflow step
 * @param output - The step output text to validate
 * @returns true if the gate check passes
 */
export function evaluateGate(gate: string, output: string): boolean {
  if (!gate || gate === "none" || gate === "always") {
    return true;
  }

  const normalized = gate.toLowerCase().trim();

  if (normalized === "not-empty" || normalized === "non-empty") {
    return output.trim().length > 0;
  }

  if (normalized === "exit-code:0" || normalized.startsWith("exit-code: 0")) {
    return true; // If we got output, execution succeeded
  }

  if (normalized.startsWith("contains:")) {
    const needle = gate.slice("contains:".length).trim().toLowerCase();
    return output.toLowerCase().includes(needle);
  }

  // Default: treat as a loose substring match
  return output.toLowerCase().includes(normalized);
}

/**
 * Build a prompt for a workflow step that includes the step action,
 * expected output description, and any prior context.
 *
 * @param step - The workflow step definition
 * @param priorOutput - Output from the previous step (if any)
 * @returns Assembled prompt string
 */
export function buildStepPrompt(step: WorkflowStep, priorOutput?: string): string {
  let prompt = `Task: ${step.action}\n\nExpected output: ${step.output}`;
  if (priorOutput) {
    prompt += `\n\nContext from previous step:\n${priorOutput}`;
  }
  return prompt;
}

/**
 * Run a complete workflow by executing each step sequentially.
 *
 * @param config - Gemini Pilot configuration
 * @param workflow - The workflow definition to execute
 * @param options - Execution options
 * @returns Workflow run result
 */
export function runWorkflow(
  config: GeminiPilotConfig,
  workflow: WorkflowDefinition,
  options: { dryRun?: boolean; projectRoot?: string } = {},
): WorkflowRunResult {
  const { dryRun = false, projectRoot } = options;
  const policy = workflow.frontmatter.execution_policy;
  const stateManager = new StateManager(projectRoot);

  const result: WorkflowRunResult = {
    workflowName: workflow.frontmatter.name,
    steps: [],
    status: dryRun ? "dry-run" : "completed",
    totalIterations: 0,
    totalElapsedMs: 0,
  };

  // Initialize workflow state
  const workflowState: WorkflowState = {
    workflowName: workflow.frontmatter.name,
    currentStep: 0,
    totalSteps: workflow.steps.length,
    status: "running",
    iterations: 0,
    stepResults: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  stateManager.saveWorkflowState(workflowState);

  // Ensure gemini CLI is available when running for real
  if (!dryRun) {
    ensureGeminiInstalled();
  }

  console.log(`\nWorkflow: ${workflow.frontmatter.name}`);
  console.log(`Description: ${workflow.frontmatter.description}`);
  console.log(`Steps: ${workflow.steps.length} | Max iterations: ${policy.max_iterations}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  let stepIndex = 0;
  let priorOutput: string | undefined;
  let iterations = 0;

  while (stepIndex < workflow.steps.length && iterations < policy.max_iterations) {
    iterations++;
    const step = workflow.steps[stepIndex]!;

    // Determine the model tier from agent name
    const tier = agentNameToTier(step.agent);
    const model = resolveModel(config, tier);

    console.log(`  Step ${stepIndex + 1}/${workflow.steps.length}: [${step.agent}] ${step.action}`);

    if (dryRun) {
      const args = buildGeminiArgs({ model, approvalMode: "auto" });
      args.push(buildStepPrompt(step, priorOutput));
      printDryRun({
        command: `gemini ${args.join(" ")}`,
        model,
        tier,
        approvalMode: "auto",
        agent: step.agent,
      });

      result.steps.push({
        stepIndex,
        agent: step.agent,
        output: "[DRY RUN]",
        gatePassed: true,
        elapsedMs: 0,
      });

      stepIndex++;
      continue;
    }

    // Execute the step
    const startTime = Date.now();
    let output: string;
    try {
      const prompt = buildStepPrompt(step, priorOutput);
      output = executePrompt(config, prompt, tier);
    } catch (err) {
      output = `Error: ${err instanceof Error ? err.message : String(err)}`;
      log.error(`Step ${stepIndex + 1} execution failed`, err);
    }
    const elapsed = Date.now() - startTime;

    // Check gate
    const gatePassed = evaluateGate(step.gate, output);
    console.log(`    Gate "${step.gate}": ${gatePassed ? "PASSED" : "FAILED"} (${elapsed}ms)`);

    result.steps.push({ stepIndex, agent: step.agent, output, gatePassed, elapsedMs: elapsed });

    // Update workflow state
    workflowState.currentStep = stepIndex;
    workflowState.iterations = iterations;
    workflowState.stepResults.push({ stepIndex, gatePassed, elapsedMs: elapsed });
    workflowState.updatedAt = new Date().toISOString();
    stateManager.saveWorkflowState(workflowState);

    hooks.emit("workflow-step", {
      workflowName: workflow.frontmatter.name,
      stepIndex,
      agent: step.agent,
      gatePassed,
    });

    if (!gatePassed) {
      if (step.loop_to !== undefined && step.loop_to >= 0 && step.loop_to < workflow.steps.length) {
        console.log(`    Looping back to step ${step.loop_to + 1}`);
        stepIndex = step.loop_to;
        priorOutput = output;
        continue;
      }

      if (policy.halt_on_failure) {
        console.log(`\n  Workflow halted at step ${stepIndex + 1} (gate failed, halt_on_failure=true)`);
        result.status = "failed";
        workflowState.status = "failed";
        stateManager.saveWorkflowState(workflowState);
        break;
      }
    }

    priorOutput = output;
    stepIndex++;
  }

  if (iterations >= policy.max_iterations && stepIndex < workflow.steps.length) {
    console.log(`\n  ${formatError("GP_022")}`);
    result.status = "failed";
    workflowState.status = "failed";
  } else if (result.status !== "failed" && result.status !== "dry-run") {
    workflowState.status = "completed";
  }

  result.totalIterations = iterations;
  result.totalElapsedMs = result.steps.reduce((sum, s) => sum + s.elapsedMs, 0);

  workflowState.updatedAt = new Date().toISOString();
  stateManager.saveWorkflowState(workflowState);

  console.log(`\nWorkflow ${result.status}. Iterations: ${iterations}, Total time: ${result.totalElapsedMs}ms\n`);

  return result;
}

/**
 * Map a known agent name to a model tier.
 *
 * Agents whose names suggest high complexity get the "high" tier,
 * simple execution agents get "fast", and everything else is "balanced".
 *
 * @param agentName - The agent role name
 * @returns Corresponding model tier
 */
function agentNameToTier(agentName: string): "high" | "balanced" | "fast" {
  const highAgents = ["architect", "planner", "analyst", "scientist", "security-auditor"];
  const fastAgents = ["executor", "debugger", "test-engineer"];
  if (highAgents.includes(agentName)) return "high";
  if (fastAgents.includes(agentName)) return "fast";
  return "balanced";
}
