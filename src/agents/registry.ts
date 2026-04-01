/**
 * Agent registry: resolves agent definitions from prompts and config.
 *
 * An "agent" is a named role (e.g. "architect", "executor") that combines
 * a system prompt, model identifier, quality tier, and reasoning effort.
 *
 * @module agents/registry
 */

import { z } from "zod";
import type { PromptDefinition } from "../prompts/loader.js";
import type { ModelsConfig, ModelTier } from "../config/schema.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("agents");

export const AgentDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  model: z.string(),
  tier: z.enum(["high", "balanced", "fast"]),
  reasoningEffort: z.enum(["low", "medium", "high"]),
  systemPrompt: z.string(),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

/**
 * Map a Gemini model name to a quality tier.
 *
 * @param model - Model identifier string
 * @returns The inferred model tier
 */
function modelToTier(model: string): ModelTier {
  if (model.includes("3.1-pro")) return "high";
  if (model.includes("3.1-flash") && !model.includes("flash-lite")) return "balanced";
  return "fast";
}

/**
 * Resolve an agent definition from a prompt definition and model config.
 *
 * @param prompt - The parsed prompt definition
 * @param models - Model configuration mapping tiers to identifiers
 * @returns A fully resolved AgentDefinition
 */
export function resolveAgent(
  prompt: PromptDefinition,
  models: ModelsConfig,
): AgentDefinition {
  const tier = modelToTier(prompt.frontmatter.model);
  const resolvedModel = models[tier];

  return {
    name: prompt.frontmatter.name,
    description: prompt.frontmatter.description,
    model: resolvedModel,
    tier,
    reasoningEffort: prompt.frontmatter.reasoning_effort,
    systemPrompt: prompt.body,
  };
}

/**
 * Agent registry that manages agent definitions.
 */
export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  /**
   * Register an agent definition.
   * @param agent - Agent definition to register
   */
  register(agent: AgentDefinition): void {
    this.agents.set(agent.name, agent);
    log.debug(`Registered agent: ${agent.name} (${agent.model})`);
  }

  /**
   * Retrieve an agent by name.
   * @param name - Agent name
   * @returns The agent definition, or undefined
   */
  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  /**
   * List all registered agents.
   * @returns Array of agent definitions
   */
  list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * List all registered agent names.
   * @returns Array of agent name strings
   */
  names(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check if an agent is registered.
   * @param name - Agent name to check
   * @returns true if the agent exists
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  get size(): number {
    return this.agents.size;
  }
}

/**
 * Build an agent registry from a set of prompts and model config.
 *
 * @param prompts - Map of prompt name to prompt definition
 * @param models - Model configuration mapping tiers to identifiers
 * @returns Populated AgentRegistry
 */
export function buildAgentRegistry(
  prompts: Map<string, PromptDefinition>,
  models: ModelsConfig,
): AgentRegistry {
  const registry = new AgentRegistry();
  for (const [, prompt] of prompts) {
    const agent = resolveAgent(prompt, models);
    registry.register(agent);
  }
  log.info(`Agent registry built with ${registry.size} agents`);
  return registry;
}
