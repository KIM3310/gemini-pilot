/**
 * Project initialization templates.
 *
 * Provides pre-configured workflows, prompts, and configuration for
 * common project types: node, python, fullstack.
 *
 * @module init/templates
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ensureDir, writeJsonFile, writeTextFile } from "../utils/fs.js";
import { createLogger } from "../utils/logger.js";
import { formatError } from "../errors/index.js";

const log = createLogger("init");

/** Known template names. */
export type TemplateName = "node" | "python" | "fullstack";

/** All available template names. */
export const TEMPLATE_NAMES: TemplateName[] = ["node", "python", "fullstack"];

/** Structure of a project template. */
export interface ProjectTemplate {
  /** Template identifier. */
  name: TemplateName;
  /** Human-readable description. */
  description: string;
  /** Configuration overrides. */
  config: Record<string, unknown>;
  /** Workflow files to create (filename -> content). */
  workflows: Record<string, string>;
  /** Additional tech-stack entries for memory. */
  techStack: string[];
  /** Conventions to set. */
  conventions: string[];
}

/**
 * Build the Node.js project template.
 *
 * @returns The node template definition
 */
function nodeTemplate(): ProjectTemplate {
  return {
    name: "node",
    description: "Node.js / TypeScript project with testing and linting workflows",
    config: {
      models: {
        high: "gemini-3.1-pro",
        balanced: "gemini-3.1-flash",
        fast: "gemini-3.1-flash-lite",
      },
      session: { defaultTier: "balanced", approvalMode: "auto" },
    },
    workflows: {
      "ci-check.md": `---
name: ci-check
description: Run full CI pipeline -- lint, type-check, test, build
triggers:
  - "run ci"
  - "check everything"
execution_policy:
  max_iterations: 3
  halt_on_failure: true
---

### 1. Lint
- **agent**: reviewer
- **action**: Run the project linter and fix any issues
- **output**: Clean lint output
- **gate**: exit-code:0

### 2. Type Check
- **agent**: architect
- **action**: Run TypeScript type-checking (tsc --noEmit)
- **output**: No type errors
- **gate**: exit-code:0

### 3. Test
- **agent**: test-engineer
- **action**: Run the full test suite
- **output**: All tests passing
- **gate**: contains:pass

### 4. Build
- **agent**: executor
- **action**: Build the project for production
- **output**: Successful build artifacts
- **gate**: exit-code:0
`,
    },
    techStack: ["Node.js", "TypeScript", "npm"],
    conventions: [
      "Use ESM imports",
      "Strict TypeScript",
      "Tests in __tests__/ directory",
    ],
  };
}

/**
 * Build the Python project template.
 *
 * @returns The python template definition
 */
function pythonTemplate(): ProjectTemplate {
  return {
    name: "python",
    description: "Python project with pytest, type-checking, and formatting workflows",
    config: {
      models: {
        high: "gemini-3.1-pro",
        balanced: "gemini-3.1-flash",
        fast: "gemini-3.1-flash-lite",
      },
      session: { defaultTier: "balanced", approvalMode: "auto" },
    },
    workflows: {
      "py-check.md": `---
name: py-check
description: Run Python CI -- format, type-check, test
triggers:
  - "run checks"
  - "python ci"
execution_policy:
  max_iterations: 3
  halt_on_failure: true
---

### 1. Format
- **agent**: reviewer
- **action**: Run black and isort to format all Python files
- **output**: All files formatted
- **gate**: exit-code:0

### 2. Type Check
- **agent**: architect
- **action**: Run mypy for static type checking
- **output**: No type errors
- **gate**: exit-code:0

### 3. Test
- **agent**: test-engineer
- **action**: Run pytest with coverage reporting
- **output**: All tests passing with coverage report
- **gate**: contains:passed
`,
    },
    techStack: ["Python", "pytest", "mypy", "black"],
    conventions: [
      "Type hints on all functions",
      "Tests in tests/ directory",
      "Use pyproject.toml for config",
    ],
  };
}

/**
 * Build the fullstack project template.
 *
 * @returns The fullstack template definition
 */
function fullstackTemplate(): ProjectTemplate {
  return {
    name: "fullstack",
    description: "Full-stack project with frontend, backend, and E2E testing workflows",
    config: {
      models: {
        high: "gemini-3.1-pro",
        balanced: "gemini-3.1-flash",
        fast: "gemini-3.1-flash-lite",
      },
      session: { defaultTier: "balanced", approvalMode: "auto" },
      team: { maxWorkers: 4 },
    },
    workflows: {
      "fullstack-check.md": `---
name: fullstack-check
description: Full-stack CI -- backend, frontend, E2E
triggers:
  - "full check"
  - "check all"
execution_policy:
  max_iterations: 5
  halt_on_failure: false
---

### 1. Backend Tests
- **agent**: test-engineer
- **action**: Run backend unit and integration tests
- **output**: Backend tests passing
- **gate**: contains:pass

### 2. Frontend Lint
- **agent**: reviewer
- **action**: Lint frontend code (ESLint, Prettier)
- **output**: Clean lint output
- **gate**: exit-code:0

### 3. Frontend Tests
- **agent**: test-engineer
- **action**: Run frontend unit tests
- **output**: Frontend tests passing
- **gate**: contains:pass

### 4. Build
- **agent**: executor
- **action**: Build both frontend and backend for production
- **output**: Successful build artifacts
- **gate**: exit-code:0

### 5. E2E Tests
- **agent**: test-engineer
- **action**: Run end-to-end tests against the built application
- **output**: E2E tests passing
- **gate**: contains:pass
`,
    },
    techStack: ["Node.js", "TypeScript", "React", "REST API"],
    conventions: [
      "Monorepo structure",
      "Shared types package",
      "API-first design",
    ],
  };
}

/**
 * Retrieve a template by name.
 *
 * @param name - Template name
 * @returns The template definition, or undefined if not found
 */
export function getTemplate(name: string): ProjectTemplate | undefined {
  switch (name) {
    case "node":
      return nodeTemplate();
    case "python":
      return pythonTemplate();
    case "fullstack":
      return fullstackTemplate();
    default:
      return undefined;
  }
}

/**
 * Apply a project template to the current directory.
 *
 * Creates the `.gemini-pilot/` directory structure, config, workflows,
 * and sets up project memory.
 *
 * @param projectRoot - Directory to initialize
 * @param templateName - Name of the template to use
 */
export function applyTemplate(projectRoot: string, templateName: string): void {
  const template = getTemplate(templateName);
  if (!template) {
    console.error(formatError("GP_080", templateName));
    process.exit(1);
  }

  const stateDir = path.join(projectRoot, ".gemini-pilot");
  ensureDir(stateDir);
  ensureDir(path.join(stateDir, "sessions"));
  ensureDir(path.join(stateDir, "prompts"));
  ensureDir(path.join(stateDir, "workflows"));

  // Write config
  writeJsonFile(path.join(stateDir, "config.json"), template.config);

  // Write workflows
  for (const [filename, content] of Object.entries(template.workflows)) {
    writeTextFile(path.join(stateDir, "workflows", filename), content);
  }

  // Write initial memory
  writeJsonFile(path.join(stateDir, "memory.json"), {
    techStack: template.techStack,
    conventions: template.conventions,
    notes: [`Initialized with "${templateName}" template on ${new Date().toISOString()}`],
    decisions: [],
  });

  console.log(`\nInitialized with "${templateName}" template:`);
  console.log(`  ${template.description}`);
  console.log(`  State directory: ${stateDir}`);
  console.log(`  Tech stack: ${template.techStack.join(", ")}`);
  console.log(`  Custom workflows: ${Object.keys(template.workflows).length}`);
  console.log(`\nRun 'gp doctor' to verify your installation.`);
}
