/**
 * CLI provider adapters.
 *
 * Abstracts over the concrete coding-agent CLI that sessions launch.
 * Each provider declares the binary name, install instructions, and
 * default model identifiers per tier.  Session/harness code reads the
 * provider from config and uses it to spawn the right binary.
 *
 * @module providers
 */

import type { ModelsConfig } from "../config/schema.js";

/** Supported CLI providers. */
export type ProviderId = "gemini" | "qwen";

/** Canonical description of a CLI provider. */
export interface CliProvider {
  /** Stable identifier used in config/env. */
  id: ProviderId;
  /** Human-readable display name. */
  displayName: string;
  /** Binary name on $PATH (what we exec). */
  binary: string;
  /** `npm install -g ...` target to surface to users. */
  installCommand: string;
  /** Default model identifier per tier. */
  defaultModels: ModelsConfig;
  /** Upstream project URL. */
  upstreamUrl: string;
}

const GEMINI: CliProvider = {
  id: "gemini",
  displayName: "Gemini CLI",
  binary: "gemini",
  installCommand: "npm install -g @google/gemini-cli",
  defaultModels: {
    high: "gemini-3.1-pro",
    balanced: "gemini-3.1-flash",
    fast: "gemini-3.1-flash-lite",
  },
  upstreamUrl: "https://github.com/google-gemini/gemini-cli",
};

const QWEN: CliProvider = {
  id: "qwen",
  displayName: "Qwen CLI",
  binary: "qwen",
  installCommand: "npm install -g @qwen-code/qwen-code",
  defaultModels: {
    high: "qwen3-coder-plus",
    balanced: "qwen3-coder",
    fast: "qwen3-coder-flash",
  },
  upstreamUrl: "https://github.com/QwenLM/qwen-code",
};

/** Registry of all supported providers, keyed by id. */
export const PROVIDERS: Readonly<Record<ProviderId, CliProvider>> = Object.freeze({
  gemini: GEMINI,
  qwen: QWEN,
});

/**
 * Resolve a provider by id.
 *
 * @param id - Provider identifier.
 * @returns The {@link CliProvider} record.
 * @throws If the id is not a registered provider.
 */
export function getProvider(id: ProviderId): CliProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(
      `Unknown provider "${id}". Supported providers: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return provider;
}

/** List of all supported provider ids, for CLI help and validation. */
export const SUPPORTED_PROVIDERS: readonly ProviderId[] = Object.freeze(
  Object.keys(PROVIDERS) as ProviderId[],
);
