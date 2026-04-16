/**
 * Configuration schema definitions using Zod.
 *
 * Defines the shape of all configuration objects with runtime validation
 * and TypeScript type inference.
 *
 * @module config/schema
 */

import { z } from "zod";

/** Supported CLI provider ids. Kept inline to avoid a circular import. */
export const ProviderIdSchema = z.enum(["gemini", "qwen"]);
/** Provider id type. */
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** Model quality tier: "high", "balanced", or "fast". */
export const ModelTierSchema = z.enum(["high", "balanced", "fast"]);
/** Model quality tier type. */
export type ModelTier = z.infer<typeof ModelTierSchema>;

/** Tool-approval behavior: "full" (confirm every action), "auto" (smart defaults), "yolo" (no sandbox). */
export const ApprovalModeSchema = z.enum(["full", "auto", "yolo"]);
/** Approval mode type. */
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

/**
 * Model identifier mapping per tier.
 *
 * Defaults target Gemini for backward compatibility; switching the
 * provider to `qwen` overrides these at load time via
 * {@link applyProviderDefaults}.
 */
export const ModelsConfigSchema = z.object({
  high: z.string().default("gemini-3.1-pro"),
  balanced: z.string().default("gemini-3.1-flash"),
  fast: z.string().default("gemini-3.1-flash-lite"),
});
/** Model identifier mapping type. */
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

/** Per-session defaults. */
export const SessionConfigSchema = z.object({
  approvalMode: ApprovalModeSchema.default("auto"),
  defaultTier: ModelTierSchema.default("balanced"),
  contextWindow: z.number().default(1000000),
  maxTurns: z.number().default(50),
});
/** Session configuration type. */
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

/** Team-mode (multi-agent tmux) configuration. */
export const TeamConfigSchema = z.object({
  maxWorkers: z.number().default(4),
  heartbeatIntervalMs: z.number().default(5000),
  taskTimeoutMs: z.number().default(300000),
});
/** Team configuration type. */
export type TeamConfig = z.infer<typeof TeamConfigSchema>;

/** Top-level Multi-CLI Pilot configuration, combining all sections. */
export const MultiCliPilotConfigSchema = z.object({
  provider: ProviderIdSchema.default("gemini"),
  models: ModelsConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  team: TeamConfigSchema.default({}),
  promptsDir: z.string().optional(),
  workflowsDir: z.string().optional(),
});

/** Full Multi-CLI Pilot configuration type. */
export type MultiCliPilotConfig = z.infer<typeof MultiCliPilotConfigSchema>;

/**
 * Legacy alias preserved for backward compatibility with existing
 * imports (`GeminiPilotConfig`, `GeminiPilotConfigSchema`).  Prefer
 * the `MultiCliPilotConfig` names in new code.
 */
export const GeminiPilotConfigSchema = MultiCliPilotConfigSchema;
/** @deprecated Use {@link MultiCliPilotConfig} instead. */
export type GeminiPilotConfig = MultiCliPilotConfig;

/** Default configuration with all fields set to their schema defaults. */
export const DEFAULT_CONFIG: MultiCliPilotConfig = MultiCliPilotConfigSchema.parse({});
