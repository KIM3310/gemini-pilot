/**
 * Configuration schema definitions using Zod.
 *
 * Defines the shape of all configuration objects with runtime validation
 * and TypeScript type inference.
 *
 * @module config/schema
 */

import { z } from "zod";

/** Model quality tier: "high" (3.1-pro), "balanced" (3.1-flash), or "fast" (3.1-flash-lite). */
export const ModelTierSchema = z.enum(["high", "balanced", "fast"]);
/** Model quality tier type. */
export type ModelTier = z.infer<typeof ModelTierSchema>;

/** Tool-approval behavior: "full" (confirm every action), "auto" (smart defaults), "yolo" (no sandbox). */
export const ApprovalModeSchema = z.enum(["full", "auto", "yolo"]);
/** Approval mode type. */
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>;

/** Model identifier mapping per tier. */
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

/** Top-level Gemini Pilot configuration, combining all sections. */
export const GeminiPilotConfigSchema = z.object({
  models: ModelsConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  team: TeamConfigSchema.default({}),
  promptsDir: z.string().optional(),
  workflowsDir: z.string().optional(),
});

/** Full Gemini Pilot configuration type. */
export type GeminiPilotConfig = z.infer<typeof GeminiPilotConfigSchema>;

/** Default configuration with all fields set to their schema defaults. */
export const DEFAULT_CONFIG: GeminiPilotConfig = GeminiPilotConfigSchema.parse({});
