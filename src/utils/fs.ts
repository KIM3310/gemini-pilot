/**
 * File system utilities for Gemini Pilot.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read a JSON file, returning undefined if it does not exist.
 */
export function readJsonFile<T>(filePath: string): T | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

/**
 * Write a JSON file, creating parent directories if needed.
 */
export function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Read a text file, returning undefined if it does not exist.
 */
export function readTextFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Write a text file, creating parent directories if needed.
 */
export function writeTextFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * List files in a directory matching an optional extension filter.
 */
export function listFiles(dirPath: string, ext?: string): string[] {
  try {
    const entries = fs.readdirSync(dirPath);
    if (ext) {
      return entries.filter((e) => e.endsWith(ext));
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Find the project root by walking up from cwd looking for .gemini-pilot/ or package.json.
 */
export function findProjectRoot(startDir?: string): string {
  let dir = startDir ?? process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (
      fs.existsSync(path.join(dir, ".gemini-pilot")) ||
      fs.existsSync(path.join(dir, "package.json"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir ?? process.cwd();
}

/**
 * Read the version from the package.json nearest to this module.
 */
export function getPackageVersion(): string {
  try {
    // Walk up from this file to find the package root
    let dir = path.dirname(new URL(import.meta.url).pathname);
    const root = path.parse(dir).root;
    while (dir !== root) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        return pkg.version ?? "0.0.0";
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fallback
  }
  return "0.0.0";
}

/**
 * Get the .gemini-pilot state directory for a project.
 */
export function getStateDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot();
  return path.join(root, ".gemini-pilot");
}
