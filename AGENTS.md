# Gemini Pilot -- Master Orchestration Contract

## Operating Principles

1. **Clarity First**: Every task must have a clear objective, measurable success criteria, and defined boundaries before execution begins.
2. **Evidence-Driven**: Decisions are backed by analysis, not assumptions. When uncertain, investigate before acting.
3. **Incremental Delivery**: Prefer small, verifiable steps over large, risky changes. Each step must leave the system in a working state.
4. **Autonomous but Accountable**: Agents operate independently within their scope but report outcomes transparently.
5. **Fail Fast, Recover Smart**: Detect errors early, report them clearly, and propose concrete recovery actions.

## Agent Selection Guidance

| Scenario | Primary Agent | Support Agents |
|---|---|---|
| New feature design | architect | planner, analyst |
| Bug investigation | debugger | analyst, reviewer |
| Code implementation | executor | architect, test-engineer |
| Performance issues | optimizer | analyst, debugger |
| Security concerns | security-auditor | reviewer, architect |
| Code quality | reviewer | refactorer, critic |
| Test coverage | test-engineer | executor, debugger |
| Documentation | documenter | architect, mentor |
| UI/UX work | designer | architect, analyst |
| Research tasks | scientist | analyst, mentor |
| Refactoring | refactorer | reviewer, test-engineer |
| Code critique | critic | reviewer, mentor |
| Knowledge transfer | mentor | documenter, architect |

### Model Routing

- **gemini-3.1-pro**: Complex reasoning, architecture decisions, security analysis, multi-step planning
- **gemini-3.1-flash**: Code generation, reviews, testing, documentation, standard implementation
- **gemini-3.1-flash-lite**: Quick queries, formatting, simple lookups, status checks

## Workflow Activation Rules

Workflows activate based on task characteristics:

- **autopilot**: When the task is well-defined and can be fully automated (idea to verified code)
- **deep-plan**: When the task requires strategic thinking across multiple components or phases
- **sprint**: When there is a focused, time-boxed objective with clear deliverables
- **investigate**: When the root cause is unknown and systematic evidence gathering is needed
- **tdd**: When building new functionality where correctness is paramount
- **review-cycle**: When code changes need thorough quality assessment before merge
- **refactor**: When improving existing code structure without changing behavior
- **deploy-prep**: When preparing a release with verification checklists
- **interview**: When requirements are ambiguous and need structured clarification
- **team-sync**: When multiple agents must coordinate on parallel workstreams

## Team Coordination Protocol

### Phase Pipeline

```
Plan --> Execute --> Verify --> Fix (loop until green)
```

### Communication Rules

1. **Task Claims**: An agent must claim a task before starting. No two agents work the same task.
2. **Status Updates**: Agents report status at phase boundaries (start, progress, complete, blocked).
3. **Escalation**: If blocked for more than one cycle, escalate to the coordinator with context.
4. **Handoffs**: Include full context when passing work between agents -- never assume shared state.
5. **Conflicts**: When agents disagree, the architect role arbitrates with documented reasoning.

### Quality Gates

- **Plan Gate**: Plan must be reviewed by at least one other agent before execution begins.
- **Execute Gate**: Implementation must have corresponding tests before moving to verify.
- **Verify Gate**: All tests pass, no regressions, no new warnings.
- **Fix Gate**: Fixes are scoped to the failing issue -- no scope creep during fix phase.

### State Sharing

All agents share state through the `.gemini-pilot/` directory:
- `state.json` -- Current session and workflow state
- `memory.json` -- Project-level knowledge (tech stack, conventions)
- `notepad.json` -- Working notes and scratch data
- `sessions/` -- Historical session records

## Session Management

### Approval Modes

- **full**: Every action requires explicit user approval
- **auto**: Routine actions proceed automatically; destructive actions require approval
- **yolo**: All actions proceed without approval (use with caution)

### Context Injection

At session start, the harness injects:
1. This AGENTS.md contract
2. The selected agent's role prompt
3. Project memory (if available)
4. Active workflow state (if resuming)

### Metrics Tracked

- Token usage per session
- Task completion rate
- Error frequency and recovery time
- Agent utilization across roles
