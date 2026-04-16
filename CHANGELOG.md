# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-04-16

### Added

- **Provider adapter layer** (`src/providers/`) — Gemini and Qwen CLIs
  are first-class providers with their own binary name, install
  command, and default model ids per tier.
- **`provider` config field** (`MCP_PROVIDER` / `GP_PROVIDER` env) —
  select which CLI the harness launches.
- **Provider-aware config defaults** — switching `provider` to `qwen`
  automatically substitutes `qwen3-coder-*` model ids unless they were
  explicitly overridden.
- **Standalone metrics tracker** (`src/metrics/`) — per-session prompt
  count, token estimate, latency samples, and human-readable summary;
  ported from the retired `qwen-pilot` repo.
- `mcp` and `multi-cli-pilot` CLI binaries, alongside the legacy `gp`
  and `gemini-pilot` names.

### Changed

- **Package renamed** `gemini-pilot` → `multi-cli-pilot` (v1.0 → v2.0).
- **Config schema renamed** `GeminiPilotConfig` → `MultiCliPilotConfig`
  (the old names remain as deprecated aliases).
- **Harness refactor** — `session.ts` now reads the provider from
  config and spawns the correct binary. Hardcoded `gemini` calls
  replaced with `provider.binary`.
- **README / README.ko.md** rewritten for dual-provider usage, with
  architecture diagram and provider-selection rules.

### Removed

- Standalone `qwen-pilot` repository — its unique contributions
  (metrics tracker, Qwen defaults) live here now.

### Backward compatibility

- `gp` and `gemini-pilot` bin entries preserved.
- `GeminiPilotConfig` / `GeminiPilotConfigSchema` preserved as
  deprecated aliases.
- `isGeminiInstalled` / `ensureGeminiInstalled` kept as deprecated
  wrappers over the new `isCliInstalled` / `ensureCliInstalled`.
- State directory is still `.gemini-pilot/` — no migration required.

## [1.0.0] - 2025-05-01

### Added

- 15 specialized agent role prompts (architect, executor, debugger, reviewer, etc.)
- 10 built-in workflows (autopilot, deep-plan, sprint, tdd, review-cycle, etc.)
- Session harness with configurable approval modes (full / auto / yolo)
- Team coordination via tmux with phase-based pipeline (Plan, Execute, Verify, Fix)
- Hook system for extending harness behavior with lifecycle events
- MCP server integration with state, memory, notepad, and session tools
- JSON-based state persistence in `.gemini-pilot/` directory
- CLI with commands: setup, harness, team, ask, prompts, workflows, doctor, config, status, mcp
- Context injection from AGENTS.md contract and project memory
- Model tier routing (high / balanced / fast)
