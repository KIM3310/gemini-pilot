/**
 * Hierarchical config loader: defaults -> user config -> project config -> env vars.
 *
 * Loading priority (later layers win):
 *   1. Built-in defaults (see schema.ts)
 *   2. User-level config (`~/.config/gemini-pilot/config.json`)
 *   3. Project-level config (`.gemini-pilot/config.json`)
 *   4. Environment variables (`GP_MODEL_HIGH`, etc.)
 *
 * @module config/loader
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  MultiCliPilotConfigSchema,
  type MultiCliPilotConfig,
  DEFAULT_CONFIG,
  ProviderIdSchema,
  type ProviderId,
} from "./schema.js";
import { readJsonFile, getStateDir } from "../utils/fs.js";
import { createLogger } from "../utils/logger.js";
import { getProvider } from "../providers/index.js";

/** Alias retained for older import sites. */
type GeminiPilotConfig = MultiCliPilotConfig;

const log = createLogger("config");

/**
 * Path to user-level config file.
 */
export function getUserConfigPath(): string {
  return path.join(os.homedir(), ".config", "gemini-pilot", "config.json");
}

/**
 * Path to project-level config file.
 */
export function getProjectConfigPath(projectRoot?: string): string {
  return path.join(getStateDir(projectRoot), "config.json");
}

/**
 * Deep merge two objects. Source values override target values.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}

/**
 * Swap model tier defaults to match the active provider when the user
 * has not explicitly configured model ids.
 *
 * We consider a model "not explicitly configured" when it still equals
 * the Gemini-family default baked into the Zod schema.  This keeps
 * existing user configs untouched while giving Qwen users sensible
 * model ids out of the box.
 */
function applyProviderDefaults(config: MultiCliPilotConfig): MultiCliPilotConfig {
  const provider = getProvider(config.provider);
  if (provider.id === "gemini") {
    return config;
  }
  const geminiDefaults = DEFAULT_CONFIG.models;
  const models = { ...config.models };
  if (models.high === geminiDefaults.high) models.high = provider.defaultModels.high;
  if (models.balanced === geminiDefaults.balanced) models.balanced = provider.defaultModels.balanced;
  if (models.fast === geminiDefaults.fast) models.fast = provider.defaultModels.fast;
  return { ...config, models };
}

/**
 * Apply environment variable overrides.
 *
 * Supported variables:
 *   - `MCP_PROVIDER` / `GP_PROVIDER` -- CLI provider ("gemini" or "qwen")
 *   - `GP_MODEL_HIGH` / `GP_MODEL_BALANCED` / `GP_MODEL_FAST`
 */
function applyEnvOverrides(config: MultiCliPilotConfig): MultiCliPilotConfig {
  const result = { ...config, models: { ...config.models } };

  const providerEnv = process.env.MCP_PROVIDER ?? process.env.GP_PROVIDER;
  if (providerEnv) {
    const parsed = ProviderIdSchema.safeParse(providerEnv);
    if (parsed.success) {
      result.provider = parsed.data as ProviderId;
    } else {
      log.warn(`Ignoring unknown provider env value: ${providerEnv}`);
    }
  }

  if (process.env.GP_MODEL_HIGH) {
    result.models.high = process.env.GP_MODEL_HIGH;
  }
  if (process.env.GP_MODEL_BALANCED) {
    result.models.balanced = process.env.GP_MODEL_BALANCED;
  }
  if (process.env.GP_MODEL_FAST) {
    result.models.fast = process.env.GP_MODEL_FAST;
  }

  return result;
}

/**
 * Load configuration with hierarchical merging:
 * defaults -> user config -> project config -> env vars
 */
export function loadConfig(projectRoot?: string): GeminiPilotConfig {
  let config: GeminiPilotConfig = { ...DEFAULT_CONFIG };

  // Layer 1: User config
  const userConfig = readJsonFile<Partial<GeminiPilotConfig>>(getUserConfigPath());
  if (userConfig) {
    log.debug("Loaded user config");
    config = deepMerge(config, userConfig);
  }

  // Layer 2: Project config
  const projectConfig = readJsonFile<Partial<GeminiPilotConfig>>(
    getProjectConfigPath(projectRoot),
  );
  if (projectConfig) {
    log.debug("Loaded project config");
    config = deepMerge(config, projectConfig);
  }

  // Layer 3: Environment variables
  config = applyEnvOverrides(config);

  // Layer 4: Provider-aware defaults (e.g. switch Gemini -> Qwen model ids)
  config = applyProviderDefaults(config);

  // Validate final config
  const parsed = MultiCliPilotConfigSchema.safeParse(config);
  if (!parsed.success) {
    log.warn("Config validation issues, using defaults for invalid fields");
    return DEFAULT_CONFIG;
  }

  return parsed.data;
}

/**
 * Validate a config object against the schema.
 */
export function validateConfig(
  config: unknown,
): { valid: boolean; errors?: string[] } {
  const result = MultiCliPilotConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    ),
  };
}

/**
 * Load and validate the raw project config file from disk.
 * Unlike loadConfig(), this does NOT silently fall back to defaults --
 * it reports JSON parse errors and schema violations directly.
 */
export function loadAndValidateConfigFile(
  projectRoot?: string,
): { valid: boolean; errors?: string[] } {
  const configPath = getProjectConfigPath(projectRoot);
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    // No project config file -- that is fine, defaults will be used
    return { valid: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      valid: false,
      errors: [`Invalid JSON in ${configPath}: ${(err as Error).message}`],
    };
  }

  return validateConfig(parsed);
}
