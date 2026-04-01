#!/usr/bin/env node

/**
 * Gemini Pilot CLI -- Multi-agent orchestration harness for Gemini CLI.
 *
 * @module cli
 */

import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { Command } from "commander";
import { loadConfig, validateConfig, loadAndValidateConfigFile } from "../config/index.js";
import { createPromptRegistry } from "../prompts/index.js";
import { buildAgentRegistry } from "../agents/index.js";
import { createWorkflowRegistry } from "../workflows/index.js";
import { runWorkflow } from "../workflows/runner.js";
import {
  launchSession,
  executePrompt,
  printDryRun,
  resolveModel,
  buildGeminiArgs,
} from "../harness/index.js";
import { launchTeam, isTmuxAvailable } from "../team/index.js";
import { StateManager } from "../state/index.js";
import { startMcpServer } from "../mcp/index.js";
import { renderHud, renderHudFull, type HudState } from "../hud/index.js";
import { findProjectRoot, ensureDir, getStateDir, writeJsonFile, getPackageVersion } from "../utils/fs.js";
import { setLogLevel } from "../utils/logger.js";
import { formatError } from "../errors/index.js";
import { getPluginDirs, ensurePluginDirs } from "../plugins/index.js";
import { runBenchmark, printBenchmarkTable } from "../benchmark/index.js";
import { applyTemplate, TEMPLATE_NAMES } from "../init/index.js";
import { runToolBenchmark, formatBenchmarkTable as formatToolBenchmarkTable } from "../tool-reliability/index.js";
import {
  runToolBench,
  runToolBenchComparison,
  isToolCallingPromptAvailable,
  printToolBenchTable,
} from "../tool-bench/index.js";
import type { ModelTier, ApprovalMode } from "../config/schema.js";

const program = new Command();

program
  .name("gp")
  .description("Multi-agent orchestration harness for Gemini CLI")
  .version(getPackageVersion())
  .option("--verbose", "Enable verbose logging")
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().verbose) {
      setLogLevel("debug");
    }
  });

// --- gp setup ---
program
  .command("setup")
  .description("Initialize Gemini Pilot for the current project")
  .action(() => {
    const projectRoot = findProjectRoot();
    const stateDir = getStateDir(projectRoot);
    ensureDir(stateDir);
    ensureDir(`${stateDir}/sessions`);

    // Ensure plugin directories exist
    ensurePluginDirs(projectRoot);

    // Write default project config if none exists
    const configPath = `${stateDir}/config.json`;
    try {
      if (!fs.existsSync(configPath)) {
        writeJsonFile(configPath, {
          models: {
            high: "gemini-3.1-pro",
            balanced: "gemini-3.1-flash",
            fast: "gemini-3.1-flash-lite",
          },
          session: {
            approvalMode: "auto",
            defaultTier: "balanced",
          },
        });
      }
    } catch {
      // Non-fatal
    }

    console.log("Gemini Pilot initialized successfully!");
    console.log(`  State directory: ${stateDir}`);
    console.log(`  Config: ${configPath}`);
    console.log(`  Custom prompts: ${getPluginDirs(projectRoot).prompts}`);
    console.log(`  Custom workflows: ${getPluginDirs(projectRoot).workflows}`);
    console.log("\nRun 'gp doctor' to verify your installation.");
  });

// --- gp init ---
program
  .command("init")
  .description("Initialize a project with a pre-configured template")
  .option("--template <name>", `Project template: ${TEMPLATE_NAMES.join(", ")}`)
  .action((opts) => {
    if (!opts.template) {
      console.error(formatError("GP_080", "no template specified"));
      console.log(`\nAvailable templates: ${TEMPLATE_NAMES.join(", ")}`);
      console.log("Usage: gp init --template <name>");
      process.exit(1);
    }
    const projectRoot = findProjectRoot();
    applyTemplate(projectRoot, opts.template);
  });

// --- gp harness ---
program
  .command("harness")
  .description("Launch an enhanced Gemini CLI session")
  .option("--high", "Use high-tier model (gemini-3.1-pro)")
  .option("--balanced", "Use balanced-tier model (gemini-3.1-flash)")
  .option("--fast", "Use fast-tier model (gemini-3.1-flash-lite)")
  .option("--agent <name>", "Use a specific agent role")
  .option("--approval-mode <mode>", "Approval mode: full, auto, yolo", "auto")
  .option("--dry-run", "Show what would be executed without running")
  .action((opts) => {
    const config = loadConfig();
    const tier: ModelTier = opts.high
      ? "high"
      : opts.fast
        ? "fast"
        : "balanced";

    const approvalMode = opts.approvalMode as ApprovalMode;

    let agent;
    if (opts.agent) {
      const prompts = createPromptRegistry();
      const agents = buildAgentRegistry(
        new Map(prompts.list().map((p) => [p.frontmatter.name, p])),
        config.models,
      );
      agent = agents.get(opts.agent);
      if (!agent) {
        console.error(formatError("GP_010", opts.agent));
        console.error(`Available agents: ${agents.names().join(", ")}`);
        process.exit(1);
      }
    }

    launchSession(config, {
      tier,
      approvalMode,
      agent,
      dryRun: opts.dryRun ?? false,
    });
  });

// --- gp team ---
program
  .command("team <count>")
  .description("Launch multi-agent team mode via tmux")
  .option("--role <role>", "Default role for workers", "executor")
  .option("--dry-run", "Show what would be executed without running")
  .action((count: string, opts) => {
    const config = loadConfig();
    const workerCount = parseInt(count, 10);

    if (isNaN(workerCount) || workerCount < 1 || workerCount > 8) {
      console.error(formatError("GP_041"));
      process.exit(1);
    }

    if (opts.dryRun) {
      printDryRun({
        command: `tmux new-session -d -s gp-team-<id> (with ${workerCount} panes)`,
        model: resolveModel(config, "balanced"),
        tier: "balanced",
        approvalMode: "auto",
        agent: opts.role,
        env: { GP_WORKER_COUNT: String(workerCount) },
      });
      return;
    }

    launchTeam(config, {
      workerCount,
      role: opts.role,
    });
  });

// --- gp ask ---
program
  .command("ask <prompt>")
  .description("Single-shot query to Gemini")
  .option("--tier <tier>", "Model tier: high, balanced, fast", "fast")
  .option("--dry-run", "Show what would be executed without running")
  .action((prompt: string, opts) => {
    if (!prompt.trim()) {
      console.error(formatError("GP_031"));
      process.exit(1);
    }
    const config = loadConfig();
    const result = executePrompt(config, prompt, opts.tier as ModelTier, opts.dryRun ?? false);
    console.log(result);
  });

// --- gp prompts ---
const promptsCmd = program
  .command("prompts")
  .description("Manage agent role prompts");

promptsCmd
  .command("list")
  .description("List all available prompts (built-in and custom)")
  .action(() => {
    const pluginDirs = getPluginDirs();
    const registry = createPromptRegistry([pluginDirs.prompts]);
    const prompts = registry.list();

    if (prompts.length === 0) {
      console.log("No prompts found.");
      return;
    }

    console.log(`\n  Available Prompts (${prompts.length}):\n`);
    for (const p of prompts) {
      const model = p.frontmatter.model.padEnd(20);
      const effort = p.frontmatter.reasoning_effort;
      const source = p.filePath.includes(".gemini-pilot") ? "[custom]" : "[built-in]";
      console.log(`  ${p.frontmatter.name.padEnd(20)} ${model} [${effort}] ${source}`);
      console.log(`    ${p.frontmatter.description}\n`);
    }
  });

promptsCmd
  .command("show <name>")
  .description("Show details of a specific prompt")
  .action((name: string) => {
    const pluginDirs = getPluginDirs();
    const registry = createPromptRegistry([pluginDirs.prompts]);
    const prompt = registry.get(name);

    if (!prompt) {
      console.error(formatError("GP_010", name));
      console.error(`Available: ${registry.names().join(", ")}`);
      process.exit(1);
    }

    console.log(`\n  Name: ${prompt.frontmatter.name}`);
    console.log(`  Model: ${prompt.frontmatter.model}`);
    console.log(`  Effort: ${prompt.frontmatter.reasoning_effort}`);
    console.log(`  Description: ${prompt.frontmatter.description}`);
    console.log(`  File: ${prompt.filePath}`);
    console.log(`\n${prompt.body}`);
  });

// --- gp workflows ---
const workflowsCmd = program
  .command("workflows")
  .description("Manage orchestration workflows");

workflowsCmd
  .command("list")
  .description("List all available workflows (built-in and custom)")
  .action(() => {
    const pluginDirs = getPluginDirs();
    const registry = createWorkflowRegistry([pluginDirs.workflows]);
    const workflows = registry.list();

    if (workflows.length === 0) {
      console.log("No workflows found.");
      return;
    }

    console.log(`\n  Available Workflows (${workflows.length}):\n`);
    for (const w of workflows) {
      const steps = w.steps.length;
      const policy = w.frontmatter.execution_policy;
      const source = w.filePath.includes(".gemini-pilot") ? "[custom]" : "[built-in]";
      console.log(`  ${w.frontmatter.name.padEnd(18)} ${steps} steps  [max_iter=${policy.max_iterations}] ${source}`);
      console.log(`    ${w.frontmatter.description}`);
      if (w.frontmatter.triggers.length > 0) {
        console.log(`    Triggers: ${w.frontmatter.triggers.join(", ")}`);
      }
      console.log();
    }
  });

workflowsCmd
  .command("show <name>")
  .description("Show details of a specific workflow")
  .action((name: string) => {
    const pluginDirs = getPluginDirs();
    const registry = createWorkflowRegistry([pluginDirs.workflows]);
    const workflow = registry.get(name);

    if (!workflow) {
      console.error(formatError("GP_020", name));
      console.error(`Available: ${registry.names().join(", ")}`);
      process.exit(1);
    }

    console.log(`\n  Name: ${workflow.frontmatter.name}`);
    console.log(`  Description: ${workflow.frontmatter.description}`);
    console.log(`  Triggers: ${workflow.frontmatter.triggers.join(", ") || "none"}`);
    console.log(`  Max Iterations: ${workflow.frontmatter.execution_policy.max_iterations}`);
    console.log(`  Halt on Failure: ${workflow.frontmatter.execution_policy.halt_on_failure}`);
    console.log(`  File: ${workflow.filePath}`);
    console.log(`\n  Steps (${workflow.steps.length}):\n`);
    workflow.steps.forEach((step, i) => {
      console.log(`    ${i + 1}. [${step.agent}] ${step.action}`);
      console.log(`       Gate: ${step.gate}`);
      if (step.loop_to !== undefined) {
        console.log(`       Loop to step ${step.loop_to} if needed`);
      }
    });
    console.log(`\n${workflow.body}`);
  });

workflowsCmd
  .command("run <name>")
  .description("Run a workflow by executing each step sequentially")
  .option("--dry-run", "Show what would be executed without running")
  .action((name: string, opts) => {
    const config = loadConfig();
    const pluginDirs = getPluginDirs();
    const registry = createWorkflowRegistry([pluginDirs.workflows]);
    const workflow = registry.get(name);

    if (!workflow) {
      console.error(formatError("GP_020", name));
      console.error(`Available: ${registry.names().join(", ")}`);
      process.exit(1);
    }

    runWorkflow(config, workflow, { dryRun: opts.dryRun ?? false });
  });

// --- gp doctor ---
program
  .command("doctor")
  .description("Verify Gemini Pilot installation and dependencies")
  .action(() => {
    console.log("\n  Gemini Pilot Doctor\n");

    // Check Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split(".")[0]!, 10);
    const nodeOk = nodeMajor >= 20;
    console.log(
      `  ${nodeOk ? "OK" : "FAIL"}  Node.js ${nodeVersion} ${nodeOk ? "" : "(>= 20 required)"}`,
    );
    if (!nodeOk) {
      console.log(`         ${formatError("GP_004")}`);
    }

    // Check Gemini CLI
    let geminiOk = false;
    try {
      const checkCmd = process.platform === "win32" ? "where gemini" : "which gemini";
      execSync(checkCmd, { stdio: "pipe" });
      geminiOk = true;
    } catch {
      // Not found
    }
    console.log(
      `  ${geminiOk ? "OK" : "WARN"}  Gemini CLI ${geminiOk ? "found" : "not found"}`,
    );
    if (!geminiOk) {
      console.log(`         ${formatError("GP_005")}`);
    }

    // Check tmux
    const tmuxOk = isTmuxAvailable();
    console.log(
      `  ${tmuxOk ? "OK" : "WARN"}  tmux ${tmuxOk ? "found" : "not found (optional, needed for team mode)"}`,
    );

    // Check project setup
    const stateDir = getStateDir();
    const setupOk = fs.existsSync(stateDir);
    console.log(
      `  ${setupOk ? "OK" : "INFO"}  Project setup ${setupOk ? stateDir : "not initialized (run: gp setup)"}`,
    );

    // Check config
    const config = loadConfig();
    const configResult = validateConfig(config);
    console.log(
      `  ${configResult.valid ? "OK" : "WARN"}  Configuration ${configResult.valid ? "valid" : "has issues"}`,
    );

    // Check prompts (including plugins)
    const pluginDirs = getPluginDirs();
    const prompts = createPromptRegistry([pluginDirs.prompts]);
    const builtinCount = createPromptRegistry().size;
    const customCount = prompts.size - builtinCount;
    console.log(`  OK  Prompts: ${prompts.size} loaded (${builtinCount} built-in, ${customCount} custom)`);

    // Check workflows (including plugins)
    const workflows = createWorkflowRegistry([pluginDirs.workflows]);
    const builtinWfCount = createWorkflowRegistry().size;
    const customWfCount = workflows.size - builtinWfCount;
    console.log(`  OK  Workflows: ${workflows.size} loaded (${builtinWfCount} built-in, ${customWfCount} custom)`);

    console.log();
  });

// --- gp config ---
const configCmd = program
  .command("config")
  .description("Configuration management");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

configCmd
  .command("validate")
  .description("Validate current configuration")
  .action(() => {
    // First, check the raw config file on disk for JSON/schema errors
    const fileResult = loadAndValidateConfigFile();
    if (!fileResult.valid) {
      console.error(formatError("GP_001"));
      fileResult.errors?.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }

    // Then validate the merged runtime config
    const config = loadConfig();
    const result = validateConfig(config);
    if (result.valid) {
      console.log("Configuration is valid.");
    } else {
      console.error(formatError("GP_002"));
      result.errors?.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }
  });

// --- gp status ---
program
  .command("status")
  .description("Show active sessions, metrics, and current state")
  .action(() => {
    const stateManager = new StateManager();
    const sessions = stateManager.listSessions();
    const activeSessions = sessions.filter((s) => s.status === "active");
    const workflowState = stateManager.loadWorkflowState();
    const teamState = stateManager.loadTeamState();

    console.log("\n  Gemini Pilot Status\n");

    if (activeSessions.length > 0) {
      console.log(`  Active Sessions (${activeSessions.length}):`);
      for (const s of activeSessions) {
        console.log(
          `    ${s.id}  agent=${s.agent ?? "none"}  tier=${s.tier}  started=${s.startedAt}`,
        );
        if (s.metrics) {
          const m = s.metrics;
          console.log(
            `           prompts=${m.promptsSent}  tokens~${m.estimatedTokens}  elapsed=${m.elapsedMs}ms  model=${m.modelUsed ?? "unknown"}`,
          );
        }
      }
    } else {
      console.log("  No active sessions.");
    }

    // Show recent completed sessions with metrics
    const recentCompleted = sessions
      .filter((s) => s.status === "completed" && s.metrics)
      .slice(-3);
    if (recentCompleted.length > 0) {
      console.log(`\n  Recent Sessions (last ${recentCompleted.length}):`);
      for (const s of recentCompleted) {
        const m = s.metrics!;
        console.log(
          `    ${s.id}  status=${s.status}  model=${m.modelUsed ?? "unknown"}  elapsed=${m.elapsedMs}ms  prompts=${m.promptsSent}`,
        );
      }
    }

    if (workflowState) {
      console.log(
        `\n  Active Workflow: ${workflowState.workflowName} (step ${workflowState.currentStep + 1}/${workflowState.totalSteps})`,
      );
      console.log(
        `    Status: ${workflowState.status} | Iterations: ${workflowState.iterations}`,
      );
    }

    if (teamState) {
      const busy = teamState.workers.filter((w) => w.status === "busy").length;
      console.log(
        `\n  Team: ${teamState.id} (${busy}/${teamState.workerCount} busy, phase=${teamState.phase})`,
      );
    }

    console.log(
      `\n  Total Sessions: ${sessions.length}`,
    );
    console.log();
  });

// --- gp benchmark ---
program
  .command("benchmark <prompt>")
  .description("Run the same prompt across all model tiers and compare response time")
  .option("--dry-run", "Show what would be executed without running")
  .action((prompt: string, opts) => {
    if (!prompt.trim()) {
      console.error(formatError("GP_031"));
      process.exit(1);
    }
    const config = loadConfig();
    const result = runBenchmark(config, prompt, opts.dryRun ?? false);
    if (!opts.dryRun) {
      printBenchmarkTable(result);
    }
  });

// --- gp hud ---
program
  .command("hud")
  .description("Show real-time session HUD (heads-up display)")
  .option("--watch", "Refresh every 2 seconds")
  .option("--compact", "Single-line output (tmux-friendly)")
  .action((opts) => {
    const renderOnce = (): void => {
      const stateManager = new StateManager();
      const sessions = stateManager.listSessions();
      const active = sessions.find((s) => s.status === "active");
      const workflowState = stateManager.loadWorkflowState();
      const teamState = stateManager.loadTeamState();

      const hudState: HudState = {
        sessionId: active?.id ?? "none",
        model: active?.metrics?.modelUsed ?? "n/a",
        tier: active?.tier ?? "balanced",
        promptsSent: active?.metrics?.promptsSent ?? 0,
        estimatedTokens: active?.metrics?.estimatedTokens ?? 0,
        elapsedMs: active?.metrics?.elapsedMs ?? 0,
        activeWorkflow: workflowState?.workflowName ?? null,
        workflowStep: workflowState ? `${workflowState.currentStep + 1}/${workflowState.totalSteps}` : null,
        teamWorkers: teamState?.workerCount ?? 0,
        status: active ? "running" : workflowState?.status === "failed" ? "error" : "idle",
      };

      if (opts.compact) {
        console.log(renderHud(hudState));
      } else {
        console.log(renderHudFull(hudState));
      }
    };

    if (opts.watch) {
      const clear = (): void => {
        process.stdout.write("\x1b[2J\x1b[H");
      };
      clear();
      renderOnce();
      setInterval(() => {
        clear();
        renderOnce();
      }, 2000);
    } else {
      renderOnce();
    }
  });

// --- gp tool-bench ---
program
  .command("tool-bench")
  .description("Run tool-calling benchmarks (reliability + prompt optimization)")
  .option("--prompt-only", "Only run the tool-calling prompt benchmark (20 cases)")
  .option("--reliability-only", "Only run the tool reliability benchmark")
  .action((opts) => {
    if (!opts.promptOnly) {
      console.log("\n  Running tool reliability benchmark...\n");
      const result = runToolBenchmark();
      console.log(formatToolBenchmarkTable(result));
    }

    if (!opts.reliabilityOnly) {
      console.log("\n  Tool-Calling Prompt Benchmark (20 cases)\n");

      const promptAvailable = isToolCallingPromptAvailable();
      console.log(`  Tool-calling prompt: ${promptAvailable ? "loaded" : "NOT FOUND"}`);

      const comparison = runToolBenchComparison();
      printToolBenchTable(comparison.withoutPrompt, "Without Tool-Calling Prompt");
      printToolBenchTable(comparison.withPrompt, "With Tool-Calling Prompt");
      console.log(`  Improvement: ${comparison.improvementPct >= 0 ? "+" : ""}${comparison.improvementPct.toFixed(1)}%\n`);
    }
  });

// --- gp mcp ---
program
  .command("mcp")
  .description("Start the MCP server for Gemini CLI integration")
  .action(async () => {
    await startMcpServer();
  });

program.parse();
