# Changelog

All notable changes to this project will be documented in this file.

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
