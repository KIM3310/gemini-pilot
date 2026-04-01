/**
 * State manager: persists session, workflow, team, memory, and notepad state.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getStateDir, readJsonFile, writeJsonFile, ensureDir } from "../utils/fs.js";
import { createLogger } from "../utils/logger.js";
import {
  type SessionState,
  type WorkflowState,
  type TeamState,
  type ProjectMemory,
  type Notepad,
  ProjectMemorySchema,
  NotepadSchema,
} from "./schema.js";

const log = createLogger("state");

export class StateManager {
  private readonly stateDir: string;

  constructor(projectRoot?: string) {
    this.stateDir = getStateDir(projectRoot);
    ensureDir(this.stateDir);
    ensureDir(path.join(this.stateDir, "sessions"));
  }

  // --- Session State ---

  getSessionPath(sessionId: string): string {
    return path.join(this.stateDir, "sessions", `${sessionId}.json`);
  }

  saveSession(session: SessionState): void {
    writeJsonFile(this.getSessionPath(session.id), session);
    log.debug(`Session saved: ${session.id}`);
  }

  loadSession(sessionId: string): SessionState | undefined {
    return readJsonFile<SessionState>(this.getSessionPath(sessionId));
  }

  listSessions(): SessionState[] {
    const sessionsDir = path.join(this.stateDir, "sessions");
    let files: string[];
    try {
      files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    return files
      .map((f) => readJsonFile<SessionState>(path.join(sessionsDir, f)))
      .filter((s): s is SessionState => s !== undefined);
  }

  deleteSession(sessionId: string): void {
    try {
      fs.unlinkSync(this.getSessionPath(sessionId));
      log.debug(`Session deleted: ${sessionId}`);
    } catch {
      // Already gone
    }
  }

  // --- Workflow State ---

  getWorkflowStatePath(): string {
    return path.join(this.stateDir, "workflow-state.json");
  }

  saveWorkflowState(state: WorkflowState): void {
    writeJsonFile(this.getWorkflowStatePath(), state);
    log.debug(`Workflow state saved: ${state.workflowName} step ${state.currentStep}`);
  }

  loadWorkflowState(): WorkflowState | undefined {
    return readJsonFile<WorkflowState>(this.getWorkflowStatePath());
  }

  clearWorkflowState(): void {
    try {
      fs.unlinkSync(this.getWorkflowStatePath());
    } catch {
      // Already gone
    }
  }

  // --- Team State ---

  getTeamStatePath(): string {
    return path.join(this.stateDir, "team-state.json");
  }

  saveTeamState(state: TeamState): void {
    writeJsonFile(this.getTeamStatePath(), state);
    log.debug(`Team state saved: ${state.id}`);
  }

  loadTeamState(): TeamState | undefined {
    return readJsonFile<TeamState>(this.getTeamStatePath());
  }

  // --- Project Memory ---

  getMemoryPath(): string {
    return path.join(this.stateDir, "memory.json");
  }

  loadMemory(): ProjectMemory {
    const raw = readJsonFile<ProjectMemory>(this.getMemoryPath());
    return ProjectMemorySchema.parse(raw ?? {});
  }

  saveMemory(memory: ProjectMemory): void {
    writeJsonFile(this.getMemoryPath(), memory);
    log.debug("Project memory saved");
  }

  addMemoryNote(note: string): void {
    const memory = this.loadMemory();
    memory.notes.push(note);
    this.saveMemory(memory);
  }

  addTechStack(tech: string): void {
    const memory = this.loadMemory();
    if (!memory.techStack.includes(tech)) {
      memory.techStack.push(tech);
      this.saveMemory(memory);
    }
  }

  addConvention(convention: string): void {
    const memory = this.loadMemory();
    if (!memory.conventions.includes(convention)) {
      memory.conventions.push(convention);
      this.saveMemory(memory);
    }
  }

  addDecision(decision: string, rationale: string): void {
    const memory = this.loadMemory();
    memory.decisions.push({
      date: new Date().toISOString(),
      decision,
      rationale,
    });
    this.saveMemory(memory);
  }

  // --- Notepad ---

  getNotepadPath(): string {
    return path.join(this.stateDir, "notepad.json");
  }

  loadNotepad(): Notepad {
    const raw = readJsonFile<Notepad>(this.getNotepadPath());
    return NotepadSchema.parse(raw ?? {});
  }

  saveNotepad(notepad: Notepad): void {
    writeJsonFile(this.getNotepadPath(), notepad);
  }

  addNote(content: string, tags: string[] = []): void {
    const notepad = this.loadNotepad();
    notepad.entries.push({
      timestamp: new Date().toISOString(),
      content,
      tags,
    });
    this.saveNotepad(notepad);
  }

  getNotes(tag?: string): Notepad["entries"] {
    const notepad = this.loadNotepad();
    if (tag) {
      return notepad.entries.filter((e) => e.tags.includes(tag));
    }
    return notepad.entries;
  }
}
