![CI](https://github.com/KIM3310/gemini-pilot/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

[English](README.md) | [한국어](README.ko.md)

# Gemini Pilot

Multi-agent orchestration harness for [Gemini CLI](https://github.com/google-gemini/gemini-cli) -- prompts, workflows, and team coordination.

## Features

- **15 Specialized Agents** -- Architect, executor, debugger, reviewer, test-engineer, and more, each with a dedicated role prompt.
- **10 Built-in Workflows** -- autopilot, deep-plan, sprint, investigate, tdd, review-cycle, refactor, deploy-prep, interview, and team-sync.
- **Team Coordination** -- Phase-based pipeline (Plan, Execute, Verify, Fix) with quality gates and state sharing.
- **Session Management** -- Configurable approval modes (full / auto / yolo), context injection, and usage metrics.
- **Hook System** -- Event-driven hooks for extending harness behavior.
- **MCP Server** -- Model Context Protocol integration for tool-based workflows.
- **State Persistence** -- JSON-based state, memory, and notepad stored in `.gemini-pilot/`.

## Installation

### macOS
1. Download or clone this repo
2. Double-click `Install-Mac.command`
3. Done! Open Terminal and type `gp --help`

### Windows
1. Download or clone this repo
2. Double-click `Install-Windows.bat`
3. Done! Open CMD and type `gp --help`

### Linux
```bash
git clone https://github.com/KIM3310/gemini-pilot.git
cd gemini-pilot
chmod +x Install-Linux.sh && ./Install-Linux.sh
```

### npm (alternative)
```bash
npm install -g gemini-pilot
```

### Requirements

- Node.js >= 20.0.0 (the installer will install it automatically if missing)

## Quick Start

```bash
# Run via the CLI
gp

# Or use the full command name
gemini-pilot
```

## Project Structure

```
gemini-pilot/
  AGENTS.md          # Master orchestration contract
  prompts/           # 15 agent role prompts (markdown)
  workflows/         # 10 workflow definitions (markdown with frontmatter)
  src/
    agents/          # Agent registry
    cli/             # CLI entry point
    config/          # Configuration loader and schema
    harness/         # Session harness
    hooks/           # Event hook manager
    mcp/             # MCP server integration
    prompts/         # Prompt file loader
    state/           # State manager and schema
    team/            # Team coordinator
    utils/           # Logger, markdown parser, filesystem helpers
    workflows/       # Workflow engine and registry
  __tests__/         # Test suite (94 tests)
```

## Agents

| Agent | Role |
|---|---|
| architect | System design and architecture decisions |
| planner | Task breakdown and planning |
| executor | Code implementation |
| debugger | Bug investigation and diagnosis |
| reviewer | Code quality review |
| test-engineer | Test creation and coverage |
| refactorer | Code structure improvement |
| optimizer | Performance analysis and tuning |
| security-auditor | Security assessment |
| analyst | Data and requirement analysis |
| designer | UI/UX design guidance |
| documenter | Documentation creation |
| scientist | Research and experimentation |
| critic | Constructive code critique |
| mentor | Knowledge transfer and guidance |

## Workflows

| Workflow | Trigger | Description |
|---|---|---|
| autopilot | Well-defined, fully automatable tasks | Idea to verified code |
| deep-plan | Multi-component strategic planning | Deep strategic analysis |
| sprint | Focused, time-boxed objectives | Sprint execution |
| investigate | Unknown root cause | Systematic evidence gathering |
| tdd | Correctness-critical features | Test-driven development |
| review-cycle | Pre-merge quality checks | Thorough code review |
| refactor | Structural improvements | Safe refactoring |
| deploy-prep | Release preparation | Deployment checklists |
| interview | Ambiguous requirements | Structured clarification |
| team-sync | Parallel workstreams | Multi-agent coordination |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Watch mode
npm run test:watch

# Type check
npm run lint

# Build
npm run build
```

## Architecture

```mermaid
graph TD
  CLI[gp CLI] --> Harness[Session Harness]
  CLI --> Team[Team Coordinator]
  CLI --> WF[Workflow Engine]
  Harness --> Gemini[Gemini CLI]
  Team --> tmux[tmux Panes]
  tmux --> Gemini
  WF --> Agents[Agent System]
  Agents --> Gemini
  MCP[MCP Server] --> State[State Store]
  MCP --> Memory[Project Memory]
  Hooks[Hook System] --> Harness
```

## License

[MIT](LICENSE) -- Copyright (c) 2025 Doeon Kim
