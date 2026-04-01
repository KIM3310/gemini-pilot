/**
 * Workflow engine: loads, validates, and drives workflow execution.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { z } from "zod";
import { parseMarkdownWithFrontmatter } from "../utils/markdown.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("workflows");

export const WorkflowStepSchema = z.object({
  agent: z.string(),
  action: z.string(),
  output: z.string(),
  gate: z.string(),
  loop_to: z.number().optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const ExecutionPolicySchema = z.object({
  max_iterations: z.number().default(10),
  auto_approve: z.boolean().default(false),
  halt_on_failure: z.boolean().default(true),
});
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

export const WorkflowFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  triggers: z.array(z.string()).default([]),
  execution_policy: ExecutionPolicySchema.default({}),
});
export type WorkflowFrontmatter = z.infer<typeof WorkflowFrontmatterSchema>;

export interface WorkflowDefinition {
  frontmatter: WorkflowFrontmatter;
  body: string;
  steps: WorkflowStep[];
  filePath: string;
}

/**
 * Parse workflow steps from markdown body.
 * Extracts structured step data from the markdown step sections.
 */
function parseWorkflowSteps(body: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const stepRegex = /### \d+\.\s+.+\n([\s\S]*?)(?=### \d+\.|$)/g;
  let match: RegExpExecArray | null;

  while ((match = stepRegex.exec(body)) !== null) {
    const content = match[1]!;
    const agent = content.match(/\*\*agent\*\*:\s*([\w-]+)/)?.[1] ?? "executor";
    const action = content.match(/\*\*action\*\*:\s*(.+)/)?.[1] ?? "";
    const output = content.match(/\*\*output\*\*:\s*(.+)/)?.[1] ?? "";
    const gate = content.match(/\*\*gate\*\*:\s*(.+)/)?.[1] ?? "";
    const loopMatch = content.match(/\*\*loop_to\*\*:\s*(\d+)/);

    steps.push({
      agent,
      action: action.trim(),
      output: output.trim(),
      gate: gate.trim(),
      loop_to: loopMatch ? parseInt(loopMatch[1]!, 10) : undefined,
    });
  }

  return steps;
}

/**
 * Load a workflow from a markdown file.
 */
export function loadWorkflowFile(filePath: string): WorkflowDefinition | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseMarkdownWithFrontmatter<WorkflowFrontmatter>(content);
    const frontmatter = WorkflowFrontmatterSchema.parse(parsed.frontmatter);
    const steps = parseWorkflowSteps(parsed.body);

    return {
      frontmatter,
      body: parsed.body,
      steps,
      filePath,
    };
  } catch (err) {
    log.warn(`Failed to load workflow: ${filePath}`, err);
    return undefined;
  }
}

/**
 * Workflow registry for managing workflow definitions.
 */
export class WorkflowRegistry {
  private workflows = new Map<string, WorkflowDefinition>();

  addDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      log.debug(`Workflow directory not found: ${dirPath}`);
      return;
    }

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const workflow = loadWorkflowFile(path.join(dirPath, file));
      if (workflow) {
        this.workflows.set(workflow.frontmatter.name, workflow);
        log.debug(`Loaded workflow: ${workflow.frontmatter.name}`);
      }
    }
  }

  get(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  list(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  names(): string[] {
    return Array.from(this.workflows.keys());
  }

  has(name: string): boolean {
    return this.workflows.has(name);
  }

  get size(): number {
    return this.workflows.size;
  }

  /**
   * Find a workflow by trigger phrase.
   */
  findByTrigger(phrase: string): WorkflowDefinition | undefined {
    const lower = phrase.toLowerCase();
    for (const workflow of this.workflows.values()) {
      for (const trigger of workflow.frontmatter.triggers) {
        if (lower.includes(trigger.toLowerCase())) {
          return workflow;
        }
      }
    }
    return undefined;
  }
}

/**
 * Get the built-in workflows directory path.
 */
export function getBuiltinWorkflowsDir(): string {
  return path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "workflows",
  );
}

/**
 * Create a workflow registry with built-in workflows loaded.
 */
export function createWorkflowRegistry(extraDirs?: string[]): WorkflowRegistry {
  const registry = new WorkflowRegistry();
  registry.addDirectory(getBuiltinWorkflowsDir());
  if (extraDirs) {
    for (const dir of extraDirs) {
      registry.addDirectory(dir);
    }
  }
  return registry;
}
