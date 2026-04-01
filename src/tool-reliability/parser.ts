/**
 * Tool Call Parser
 *
 * Extract tool calls from model output text.
 * Supports multiple formats:
 * - JSON tool calls: {"name": "...", "arguments": {...}}
 * - XML tool calls: <tool_call><name>...</name><arguments>...</arguments></tool_call>
 * - Markdown-wrapped: ```json\n{...}\n```
 * - Array of tool calls
 *
 * @module tool-reliability/parser
 */

import type { ZodTypeAny } from "zod";
import { rjsonParse } from "./rjson.js";
import { coerceToSchema, type CoerceResult } from "./schema-coerce.js";

/** A parsed tool call. */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Schema definition for a tool. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ZodTypeAny;
}

/** Result of parsing tool calls from text. */
export interface ParseResult {
  /** Successfully parsed tool calls. */
  calls: ToolCall[];
  /** Errors encountered during parsing. */
  errors: string[];
  /** Coercion actions applied. */
  coercions: string[];
  /** The raw format detected. */
  format: "json" | "xml" | "markdown" | "unknown";
}

/**
 * Extract tool calls from model output text.
 */
export function parseToolCalls(
  text: string,
  tools?: ToolDefinition[],
): ParseResult {
  const result: ParseResult = {
    calls: [],
    errors: [],
    coercions: [],
    format: "unknown",
  };

  if (!text || !text.trim()) {
    result.errors.push("Empty input text");
    return result;
  }

  // Try XML format first (most structured)
  const xmlCalls = extractXmlToolCalls(text);
  if (xmlCalls.length > 0) {
    result.format = "xml";
    for (const call of xmlCalls) {
      const validated = validateAndCoerce(call, tools, result);
      if (validated) result.calls.push(validated);
    }
    return result;
  }

  // Try markdown-wrapped JSON
  const mdCalls = extractMarkdownToolCalls(text);
  if (mdCalls.length > 0) {
    result.format = "markdown";
    for (const call of mdCalls) {
      const validated = validateAndCoerce(call, tools, result);
      if (validated) result.calls.push(validated);
    }
    return result;
  }

  // Try raw JSON (object or array)
  const jsonCalls = extractJsonToolCalls(text);
  if (jsonCalls.length > 0) {
    result.format = "json";
    for (const call of jsonCalls) {
      const validated = validateAndCoerce(call, tools, result);
      if (validated) result.calls.push(validated);
    }
    return result;
  }

  result.errors.push("No tool calls found in text");
  return result;
}

/**
 * Extract tool calls from XML format.
 * Matches: <tool_call><name>X</name><arguments>{...}</arguments></tool_call>
 * Also matches: <function_call>...</function_call>
 */
function extractXmlToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const xmlPattern = /<(?:tool_call|function_call)\s*>([\s\S]*?)<\/(?:tool_call|function_call)>/g;

  let match: RegExpExecArray | null;
  while ((match = xmlPattern.exec(text)) !== null) {
    const inner = match[1]!;
    const nameMatch = /<name\s*>([\s\S]*?)<\/name>/.exec(inner);
    const argsMatch = /<arguments?\s*>([\s\S]*?)<\/arguments?>/.exec(inner);

    if (nameMatch) {
      const name = nameMatch[1]!.trim();
      let args: Record<string, unknown> = {};

      if (argsMatch) {
        const argsText = argsMatch[1]!.trim();
        const parsed = rjsonParse(argsText);
        if (parsed.ok && typeof parsed.value === "object" && parsed.value !== null) {
          args = parsed.value as Record<string, unknown>;
        }
      }

      calls.push({ name, arguments: args });
    }
  }

  return calls;
}

/**
 * Extract tool calls from markdown code blocks.
 */
function extractMarkdownToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const mdPattern = /```(?:json|JSON|javascript|js)?\s*\n([\s\S]*?)\n\s*```/g;

  let match: RegExpExecArray | null;
  while ((match = mdPattern.exec(text)) !== null) {
    const content = match[1]!.trim();
    const parsed = rjsonParse(content);
    if (parsed.ok) {
      const extracted = extractCallsFromValue(parsed.value);
      calls.push(...extracted);
    }
  }

  return calls;
}

/**
 * Extract tool calls from raw JSON in text.
 */
function extractJsonToolCalls(text: string): ToolCall[] {
  const parsed = rjsonParse(text);
  if (!parsed.ok) return [];

  return extractCallsFromValue(parsed.value);
}

/**
 * Given a parsed JSON value, extract ToolCall objects from it.
 * Handles single objects and arrays.
 */
function extractCallsFromValue(value: unknown): ToolCall[] {
  if (!value || typeof value !== "object") return [];

  // Array of tool calls
  if (Array.isArray(value)) {
    const calls: ToolCall[] = [];
    for (const item of value) {
      const extracted = extractCallsFromValue(item);
      calls.push(...extracted);
    }
    return calls;
  }

  const obj = value as Record<string, unknown>;

  // Direct tool call format: { name: "...", arguments: {...} }
  if (typeof obj.name === "string" && obj.arguments !== undefined) {
    const args =
      typeof obj.arguments === "object" && obj.arguments !== null
        ? (obj.arguments as Record<string, unknown>)
        : {};
    return [{ name: obj.name, arguments: args }];
  }

  // Function call format: { function: { name: "...", arguments: {...} } }
  if (obj.function && typeof obj.function === "object") {
    const fn = obj.function as Record<string, unknown>;
    if (typeof fn.name === "string") {
      const args =
        typeof fn.arguments === "object" && fn.arguments !== null
          ? (fn.arguments as Record<string, unknown>)
          : typeof fn.arguments === "string"
            ? (() => { const p = rjsonParse(fn.arguments as string); return p.ok && typeof p.value === "object" ? p.value as Record<string, unknown> : {}; })()
            : {};
      return [{ name: fn.name, arguments: args }];
    }
  }

  // Tool use format: { tool: "...", input: {...} }
  if (typeof obj.tool === "string") {
    const args =
      typeof obj.input === "object" && obj.input !== null
        ? (obj.input as Record<string, unknown>)
        : {};
    return [{ name: obj.tool, arguments: args }];
  }

  return [];
}

/**
 * Validate a tool call against available tool definitions and apply schema coercion.
 */
function validateAndCoerce(
  call: ToolCall,
  tools: ToolDefinition[] | undefined,
  result: ParseResult,
): ToolCall | null {
  if (!tools || tools.length === 0) {
    return call;
  }

  const toolDef = tools.find((t) => t.name === call.name);
  if (!toolDef) {
    // Try case-insensitive match
    const ciMatch = tools.find((t) => t.name.toLowerCase() === call.name.toLowerCase());
    if (ciMatch) {
      result.coercions.push(`tool name case fix: "${call.name}" -> "${ciMatch.name}"`);
      call = { ...call, name: ciMatch.name };
      const coerced = coerceToSchema(ciMatch.parameters, call.arguments);
      if (coerced.coerced) {
        result.coercions.push(...coerced.actions);
        return { name: call.name, arguments: coerced.value as Record<string, unknown> };
      }
      return call;
    }
    result.errors.push(`Unknown tool: "${call.name}"`);
    return null;
  }

  // Apply schema coercion
  const coerced: CoerceResult = coerceToSchema(toolDef.parameters, call.arguments);
  if (coerced.coerced) {
    result.coercions.push(...coerced.actions);
    return { name: call.name, arguments: coerced.value as Record<string, unknown> };
  }

  return call;
}
