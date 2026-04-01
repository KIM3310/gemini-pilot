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

## Tool Calling Standards

All agents follow a universal tool calling protocol to maximize first-try success rates. These standards are embedded in every agent prompt and enforced at the orchestration level.

### Universal Protocol

1. **Valid JSON only** -- No trailing commas, no single quotes, no comments in tool arguments.
2. **Exact type matching** -- If a schema says `number`, pass a number (`42`), not a string (`"42"`). If it says `string`, pass a string.
3. **All required parameters** -- Never omit a required field. Check the schema before calling.
4. **Exact parameter names** -- Use the precise name from the tool schema. No renaming, no case conversion.
5. **One action per call** -- Do not batch unrelated operations into a single tool invocation.
6. **Pre-call validation** -- Mentally verify arguments match the schema before executing.

### Structured Output Rules

- JSON output must be wrapped in ```json code fences
- JSON must be complete and parseable (no truncation, no placeholder values)
- All required fields must be present, even if the value is `null`
- Arrays must be JSON arrays (`[...]`), not comma-separated strings

### Error Recovery Protocol

When a tool call fails:
1. Read the error message to identify the failing parameter
2. Fix only the problematic parameter
3. Retry with the corrected call
4. Do not change parameters that were already correct
5. Do not add extra parameters not in the schema

### Reasoning Before Calling

Before each tool invocation, agents follow this pattern:
1. State the objective
2. Select the tool
3. Enumerate required parameters with their expected types
4. Construct valid JSON arguments
5. Execute

### Multi-Step Call Chains

- Independent calls may run in parallel
- Dependent calls must wait for prior results -- never guess at values
- Track which output feeds into the next input explicitly

### Optional Parameter Handling

- Omit optional parameters unless a specific override is needed
- Never pass `undefined` or empty strings for optional parameters
- Rely on documented defaults when no override is required

### BFCL-Aligned Patterns

These standards align with Berkeley Function Calling Leaderboard best practices:
- Explicit parameter type annotations in all tool guidance
- Multi-step function calling chains with tracked dependencies
- Clear parallel vs. sequential tool call decision guidance
- Consistent handling of optional parameters (omit when not needed)
