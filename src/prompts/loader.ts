/**
 * Prompt file loader and registry.
 *
 * Loads markdown files with YAML frontmatter as agent role prompts.
 * Supports both built-in prompts (shipped with the package) and
 * custom user prompts (in `.gemini-pilot/prompts/`).
 *
 * @module prompts/loader
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { z } from "zod";
import { parseMarkdownWithFrontmatter } from "../utils/markdown.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("prompts");

export const PromptFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  model: z.string().default("gemini-3.1-flash"),
  reasoning_effort: z.enum(["low", "medium", "high"]).default("medium"),
});

export type PromptFrontmatter = z.infer<typeof PromptFrontmatterSchema>;

export interface PromptDefinition {
  frontmatter: PromptFrontmatter;
  body: string;
  filePath: string;
}

/**
 * Load a single prompt file.
 */
export function loadPromptFile(filePath: string): PromptDefinition | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = parseMarkdownWithFrontmatter<PromptFrontmatter>(content);
    const frontmatter = PromptFrontmatterSchema.parse(parsed.frontmatter);
    return {
      frontmatter,
      body: parsed.body,
      filePath,
    };
  } catch (err) {
    log.warn(`Failed to load prompt: ${filePath}`, err);
    return undefined;
  }
}

/**
 * Load all prompts from a directory.
 */
export function loadPromptsFromDir(dirPath: string): Map<string, PromptDefinition> {
  const prompts = new Map<string, PromptDefinition>();

  if (!fs.existsSync(dirPath)) {
    log.debug(`Prompts directory not found: ${dirPath}`);
    return prompts;
  }

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const prompt = loadPromptFile(path.join(dirPath, file));
    if (prompt) {
      prompts.set(prompt.frontmatter.name, prompt);
      log.debug(`Loaded prompt: ${prompt.frontmatter.name}`);
    }
  }

  return prompts;
}

/**
 * Prompt registry that manages loading from multiple directories.
 */
export class PromptRegistry {
  private prompts = new Map<string, PromptDefinition>();
  private directories: string[] = [];

  /**
   * Add a directory to scan for prompts.
   */
  addDirectory(dirPath: string): void {
    this.directories.push(dirPath);
    const loaded = loadPromptsFromDir(dirPath);
    for (const [name, prompt] of loaded) {
      this.prompts.set(name, prompt);
    }
  }

  /**
   * Get a prompt by name.
   */
  get(name: string): PromptDefinition | undefined {
    return this.prompts.get(name);
  }

  /**
   * List all available prompts.
   */
  list(): PromptDefinition[] {
    return Array.from(this.prompts.values());
  }

  /**
   * List prompt names.
   */
  names(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * Check if a prompt exists.
   */
  has(name: string): boolean {
    return this.prompts.has(name);
  }

  /**
   * Get the number of loaded prompts.
   */
  get size(): number {
    return this.prompts.size;
  }
}

/**
 * Get the built-in prompts directory path.
 */
export function getBuiltinPromptsDir(): string {
  // Resolve relative to the package root
  return path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "prompts",
  );
}

/**
 * Create a prompt registry with built-in prompts loaded.
 */
export function createPromptRegistry(extraDirs?: string[]): PromptRegistry {
  const registry = new PromptRegistry();
  registry.addDirectory(getBuiltinPromptsDir());
  if (extraDirs) {
    for (const dir of extraDirs) {
      registry.addDirectory(dir);
    }
  }
  return registry;
}
