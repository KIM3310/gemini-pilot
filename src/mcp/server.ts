/**
 * MCP server: exposes state, memory, and session tools to Gemini CLI.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { createLogger } from "../utils/logger.js";
import { getPackageVersion } from "../utils/fs.js";

const log = createLogger("mcp");

/**
 * Create and configure the MCP server with all tools.
 */
export function createMcpServer(projectRoot?: string): McpServer {
  const server = new McpServer({
    name: "gemini-pilot",
    version: getPackageVersion(),
  });

  const state = new StateManager(projectRoot);

  // --- State Tools ---

  server.tool(
    "state_read",
    "Read a value from project state by key path",
    { key: z.string().describe("Dot-separated key path (e.g., 'memory.techStack')") },
    async ({ key }) => {
      const parts = key.split(".");
      const root = parts[0];

      let data: unknown;
      switch (root) {
        case "memory":
          data = state.loadMemory();
          break;
        case "notepad":
          data = state.loadNotepad();
          break;
        case "workflow":
          data = state.loadWorkflowState();
          break;
        case "team":
          data = state.loadTeamState();
          break;
        default:
          return { content: [{ type: "text" as const, text: `Unknown state root: ${root}` }] };
      }

      // Navigate the key path
      let current: unknown = data;
      for (let i = 1; i < parts.length; i++) {
        if (current && typeof current === "object") {
          current = (current as Record<string, unknown>)[parts[i]!];
        } else {
          current = undefined;
          break;
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(current, null, 2) ?? "null" }],
      };
    },
  );

  server.tool(
    "state_write",
    "Write a value to project state",
    {
      key: z.string().describe("State key (memory, notepad)"),
      value: z.string().describe("JSON-encoded value to write"),
    },
    async ({ key, value }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Invalid JSON: ${(err as Error).message}` }] };
      }

      switch (key) {
        case "memory":
          state.saveMemory(parsed as Parameters<typeof state.saveMemory>[0]);
          break;
        case "notepad":
          state.saveNotepad(parsed as Parameters<typeof state.saveNotepad>[0]);
          break;
        default:
          return { content: [{ type: "text" as const, text: `Cannot write to: ${key}` }] };
      }

      return { content: [{ type: "text" as const, text: `Saved ${key} successfully` }] };
    },
  );

  server.tool(
    "state_list",
    "List available state keys and their sizes",
    {},
    async () => {
      const memory = state.loadMemory();
      const notepad = state.loadNotepad();
      const workflow = state.loadWorkflowState();
      const team = state.loadTeamState();
      const sessions = state.listSessions();

      const info = {
        memory: {
          techStack: memory.techStack.length,
          conventions: memory.conventions.length,
          notes: memory.notes.length,
          decisions: memory.decisions.length,
        },
        notepad: { entries: notepad.entries.length },
        workflow: workflow ? { name: workflow.workflowName, step: workflow.currentStep } : null,
        team: team ? { id: team.id, workers: team.workerCount } : null,
        sessions: { count: sessions.length },
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }] };
    },
  );

  // --- Memory Tools ---

  server.tool(
    "memory_add_note",
    "Add a note to project memory",
    { note: z.string().describe("The note content to add") },
    async ({ note }) => {
      state.addMemoryNote(note);
      return { content: [{ type: "text" as const, text: `Note added: ${note}` }] };
    },
  );

  server.tool(
    "memory_add_tech",
    "Add a technology to the project tech stack",
    { tech: z.string().describe("Technology name (e.g., 'TypeScript', 'React')") },
    async ({ tech }) => {
      state.addTechStack(tech);
      return { content: [{ type: "text" as const, text: `Added to tech stack: ${tech}` }] };
    },
  );

  server.tool(
    "memory_add_convention",
    "Add a coding convention to project memory",
    { convention: z.string().describe("The convention to record") },
    async ({ convention }) => {
      state.addConvention(convention);
      return { content: [{ type: "text" as const, text: `Convention added: ${convention}` }] };
    },
  );

  server.tool(
    "memory_add_decision",
    "Record an architectural or technical decision",
    {
      decision: z.string().describe("The decision made"),
      rationale: z.string().describe("Why this decision was made"),
    },
    async ({ decision, rationale }) => {
      state.addDecision(decision, rationale);
      return { content: [{ type: "text" as const, text: `Decision recorded: ${decision}` }] };
    },
  );

  // --- Notepad Tools ---

  server.tool(
    "notepad_add",
    "Add an entry to the working notepad",
    {
      content: z.string().describe("Note content"),
      tags: z.string().optional().describe("Comma-separated tags"),
    },
    async ({ content, tags }) => {
      const tagList = tags ? tags.split(",").map((t) => t.trim()) : [];
      state.addNote(content, tagList);
      return { content: [{ type: "text" as const, text: `Note added with ${tagList.length} tags` }] };
    },
  );

  server.tool(
    "notepad_list",
    "List notepad entries, optionally filtered by tag",
    { tag: z.string().optional().describe("Filter by tag") },
    async ({ tag }) => {
      const notes = state.getNotes(tag);
      return { content: [{ type: "text" as const, text: JSON.stringify(notes, null, 2) }] };
    },
  );

  // --- Session Tools ---

  server.tool(
    "session_list",
    "List all recorded sessions",
    {},
    async () => {
      const sessions = state.listSessions();
      const summary = sessions.map((s) => ({
        id: s.id,
        agent: s.agent,
        status: s.status,
        startedAt: s.startedAt,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    "session_get",
    "Get details of a specific session",
    { sessionId: z.string().describe("Session ID") },
    async ({ sessionId }) => {
      const session = state.loadSession(sessionId);
      if (!session) {
        return { content: [{ type: "text" as const, text: `Session not found: ${sessionId}` }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(session, null, 2) }] };
    },
  );

  return server;
}

/**
 * Start the MCP server on stdio.
 */
export async function startMcpServer(projectRoot?: string): Promise<void> {
  const server = createMcpServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server started on stdio");
}
