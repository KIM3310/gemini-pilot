#!/usr/bin/env node

/**
 * Gemini Pilot CLI -- Multi-agent orchestration harness for Gemini CLI.
 */

import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { Command } from "commander";
import { loadConfig, validateConfig } from "../config/index.js";
import { createPromptRegistry } from "../prompts/index.js";
import { buildAgentRegistry } from "../agents/index.js";
import { createWorkflowRegistry } from "../workflows/index.js";
import {
  launchSession,
  executePrompt,
} from "../harness/index.js";
import { launchTeam, isTmuxAvailable } from "../team/index.js";
import { StateManager } from "../state/index.js";
import { startMcpServer } from "../mcp/index.js";
import { findProjectRoot, ensureDir, getStateDir, writeJsonFile } from "../utils/fs.js";
import { setLogLevel } from "../utils/logger.js";
import type { ModelTier, ApprovalMode } from "../config/schema.js";

const program = new Command();

program
  .name("gp")
  .description("Multi-agent orchestration harness for Gemini CLI")
  .version("1.0.0")
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

    // Write default project config if none exists
    const configPath = `${stateDir}/config.json`;
    try {
      if (!fs.existsSync(configPath)) {
        writeJsonFile(configPath, {
          models: {
            high: "gemini-2.5-pro",
            balanced: "gemini-2.5-flash",
            fast: "gemini-2.0-flash",
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
    console.log("\nRun 'gp doctor' to verify your installation.");
  });

// --- gp harness ---
program
  .command("harness")
  .description("Launch an enhanced Gemini CLI session")
  .option("--high", "Use high-tier model (gemini-2.5-pro)")
  .option("--balanced", "Use balanced-tier model (gemini-2.5-flash)")
  .option("--fast", "Use fast-tier model (gemini-2.0-flash)")
  .option("--agent <name>", "Use a specific agent role")
  .option("--approval-mode <mode>", "Approval mode: full, auto, yolo", "auto")
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
        console.error(`Unknown agent: ${opts.agent}`);
        console.error(`Available agents: ${agents.names().join(", ")}`);
        process.exit(1);
      }
    }

    launchSession(config, {
      tier,
      approvalMode,
      agent,
    });
  });

// --- gp team ---
program
  .command("team <count>")
  .description("Launch multi-agent team mode via tmux")
  .option("--role <role>", "Default role for workers", "executor")
  .action((count: string, opts) => {
    const config = loadConfig();
    const workerCount = parseInt(count, 10);

    if (isNaN(workerCount) || workerCount < 1 || workerCount > 8) {
      console.error("Worker count must be between 1 and 8");
      process.exit(1);
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
  .action((prompt: string, opts) => {
    const config = loadConfig();
    const result = executePrompt(config, prompt, opts.tier as ModelTier);
    console.log(result);
  });

// --- gp prompts ---
const promptsCmd = program
  .command("prompts")
  .description("Manage agent role prompts");

promptsCmd
  .command("list")
  .description("List all available prompts")
  .action(() => {
    const registry = createPromptRegistry();
    const prompts = registry.list();

    if (prompts.length === 0) {
      console.log("No prompts found.");
      return;
    }

    console.log(`\n  Available Prompts (${prompts.length}):\n`);
    for (const p of prompts) {
      const model = p.frontmatter.model.padEnd(20);
      const effort = p.frontmatter.reasoning_effort;
      console.log(`  ${p.frontmatter.name.padEnd(20)} ${model} [${effort}]`);
      console.log(`    ${p.frontmatter.description}\n`);
    }
  });

promptsCmd
  .command("show <name>")
  .description("Show details of a specific prompt")
  .action((name: string) => {
    const registry = createPromptRegistry();
    const prompt = registry.get(name);

    if (!prompt) {
      console.error(`Prompt not found: ${name}`);
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
  .description("List all available workflows")
  .action(() => {
    const registry = createWorkflowRegistry();
    const workflows = registry.list();

    if (workflows.length === 0) {
      console.log("No workflows found.");
      return;
    }

    console.log(`\n  Available Workflows (${workflows.length}):\n`);
    for (const w of workflows) {
      const steps = w.steps.length;
      const policy = w.frontmatter.execution_policy;
      console.log(`  ${w.frontmatter.name.padEnd(18)} ${steps} steps  [max_iter=${policy.max_iterations}]`);
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
    const registry = createWorkflowRegistry();
    const workflow = registry.get(name);

    if (!workflow) {
      console.error(`Workflow not found: ${name}`);
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
  .description("Run a workflow")
  .action((name: string) => {
    const registry = createWorkflowRegistry();
    const workflow = registry.get(name);

    if (!workflow) {
      console.error(`Workflow not found: ${name}`);
      console.error(`Available: ${registry.names().join(", ")}`);
      process.exit(1);
    }

    console.log(`\nWorkflow: ${workflow.frontmatter.name}`);
    console.log(`Description: ${workflow.frontmatter.description}`);
    console.log(`Steps: ${workflow.steps.length}`);
    console.log(`\nExecution would run the following steps:\n`);
    workflow.steps.forEach((step, i) => {
      console.log(`  ${i + 1}. [${step.agent}] ${step.action}`);
      console.log(`     Gate: ${step.gate}`);
      if (step.loop_to !== undefined) {
        console.log(`     Loop to step ${step.loop_to} if needed`);
      }
    });
    console.log(
      "\nNote: Full workflow execution requires an active Gemini CLI session.",
    );
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

    // Check Gemini CLI
    let geminiOk = false;
    try {
      execSync("which gemini", { stdio: "pipe" });
      geminiOk = true;
    } catch {
      // Not found
    }
    console.log(
      `  ${geminiOk ? "OK" : "WARN"}  Gemini CLI ${geminiOk ? "found" : "not found (install: npm i -g @google/gemini-cli)"}`,
    );

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

    // Check prompts
    const prompts = createPromptRegistry();
    console.log(`  OK  Prompts: ${prompts.size} loaded`);

    // Check workflows
    const workflows = createWorkflowRegistry();
    console.log(`  OK  Workflows: ${workflows.size} loaded`);

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
    const config = loadConfig();
    const result = validateConfig(config);
    if (result.valid) {
      console.log("Configuration is valid.");
    } else {
      console.error("Configuration has errors:");
      result.errors?.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }
  });

// --- gp status ---
program
  .command("status")
  .description("Show active sessions and current state")
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
      }
    } else {
      console.log("  No active sessions.");
    }

    if (workflowState) {
      console.log(
        `\n  Active Workflow: ${workflowState.workflowName} (step ${workflowState.currentStep + 1}/${workflowState.totalSteps})`,
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

// --- gp mcp ---
program
  .command("mcp")
  .description("Start the MCP server for Gemini CLI integration")
  .action(async () => {
    await startMcpServer();
  });

program.parse();
