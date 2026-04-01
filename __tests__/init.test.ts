import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getTemplate, TEMPLATE_NAMES, applyTemplate } from "../src/init/templates.js";

describe("Init Templates", () => {
  it("should have all expected template names", () => {
    expect(TEMPLATE_NAMES).toContain("node");
    expect(TEMPLATE_NAMES).toContain("python");
    expect(TEMPLATE_NAMES).toContain("fullstack");
  });

  it("should return undefined for unknown template", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  it("node template should have correct structure", () => {
    const t = getTemplate("node")!;
    expect(t.name).toBe("node");
    expect(t.techStack).toContain("Node.js");
    expect(t.techStack).toContain("TypeScript");
    expect(Object.keys(t.workflows).length).toBeGreaterThan(0);
    expect(t.conventions.length).toBeGreaterThan(0);
  });

  it("python template should have correct structure", () => {
    const t = getTemplate("python")!;
    expect(t.name).toBe("python");
    expect(t.techStack).toContain("Python");
    expect(t.techStack).toContain("pytest");
  });

  it("fullstack template should have correct structure", () => {
    const t = getTemplate("fullstack")!;
    expect(t.name).toBe("fullstack");
    expect(t.techStack).toContain("React");
  });
});

describe("applyTemplate", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gp-init-test-"));
    // Create a package.json so findProjectRoot works
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create all expected directories and files", () => {
    applyTemplate(tmpDir, "node");

    const stateDir = path.join(tmpDir, ".gemini-pilot");
    expect(fs.existsSync(stateDir)).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "sessions"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "prompts"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "workflows"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "memory.json"))).toBe(true);
  });

  it("should write correct config", () => {
    applyTemplate(tmpDir, "node");

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".gemini-pilot", "config.json"), "utf-8"),
    );
    expect(config.models.high).toBe("gemini-3.1-pro");
  });

  it("should initialize memory with template tech stack", () => {
    applyTemplate(tmpDir, "python");

    const memory = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".gemini-pilot", "memory.json"), "utf-8"),
    );
    expect(memory.techStack).toContain("Python");
    expect(memory.conventions).toContain("Type hints on all functions");
    expect(memory.notes.length).toBe(1);
  });
});
