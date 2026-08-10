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
import { type CoerceResult, coerceToSchema } from "./schema-coerce.js";

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

  if (!text?.trim()) {
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
 * A tagged region extracted from the XML-like tool-call format.
 */
interface TaggedContent {
  tag: string;
  content: string;
}

/**
 * Test a single character for JavaScript whitespace without a repeating regex.
 */
function isWhitespaceCharacter(character: string): boolean {
  return character.length > 0 && character.trim() === "";
}

/**
 * Return the content start for an opening tag at `index`, if it is valid.
 * Tool-call XML permits whitespace before `>` but does not permit attributes.
 */
function openingTagContentStart(
  text: string,
  index: number,
  tag: string,
): number | undefined {
  const prefix = `<${tag}`;
  if (!text.startsWith(prefix, index)) return undefined;

  let cursor = index + prefix.length;
  while (cursor < text.length && isWhitespaceCharacter(text[cursor] ?? "")) {
    cursor++;
  }

  return text[cursor] === ">" ? cursor + 1 : undefined;
}

/**
 * Extract non-nested tagged regions in one forward pass.
 *
 * A scanner is used instead of a lazy `.*`-style regular expression so
 * malformed model output with many unmatched opening tags is handled in
 * linear time.
 */
function extractTaggedContents(
  text: string,
  tags: readonly string[],
): TaggedContent[] {
  const extracted: TaggedContent[] = [];
  let openTag: string | undefined;
  let contentStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const marker = text.indexOf("<", cursor);
    if (marker === -1) break;

    if (openTag !== undefined) {
      const closingTag = `</${openTag}>`;
      if (text.startsWith(closingTag, marker)) {
        extracted.push({
          tag: openTag,
          content: text.slice(contentStart, marker),
        });
        openTag = undefined;
        cursor = marker + closingTag.length;
        continue;
      }

      cursor = marker + 1;
      continue;
    }

    let foundOpeningTag = false;
    for (const tag of tags) {
      const nextContentStart = openingTagContentStart(text, marker, tag);
      if (nextContentStart !== undefined) {
        openTag = tag;
        contentStart = nextContentStart;
        cursor = nextContentStart;
        foundOpeningTag = true;
        break;
      }
    }

    if (!foundOpeningTag) cursor = marker + 1;
  }

  return extracted;
}

/**
 * Extract tool calls from XML format.
 * Matches: <tool_call><name>X</name><arguments>{...}</arguments></tool_call>
 * Also matches: <function_call>...</function_call>
 */
function extractXmlToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regions = extractTaggedContents(text, ["tool_call", "function_call"]);

  for (const region of regions) {
    const nameRegion = extractTaggedContents(region.content, ["name"])[0];
    const argsRegion = extractTaggedContents(region.content, [
      "arguments",
      "argument",
    ])[0];

    if (nameRegion) {
      const name = nameRegion.content.trim();
      let args: Record<string, unknown> = {};

      if (argsRegion) {
        const argsText = argsRegion.content.trim();
        const parsed = rjsonParse(argsText);
        if (
          parsed.ok &&
          typeof parsed.value === "object" &&
          parsed.value !== null
        ) {
          args = parsed.value as Record<string, unknown>;
        }
      }

      calls.push({ name, arguments: args });
    }
  }

  return calls;
}

const MARKDOWN_FENCE_LANGUAGES = ["json", "JSON", "javascript", "js"] as const;

/**
 * Find a valid opening fence on a line. The original accepted a fence anywhere
 * on the line, followed by an optional supported language and whitespace.
 */
function findOpeningFence(
  text: string,
  lineStart: number,
  lineEnd: number,
): number | undefined {
  let headerEnd = lineEnd;
  while (
    headerEnd > lineStart &&
    isWhitespaceCharacter(text[headerEnd - 1] ?? "")
  ) {
    headerEnd--;
  }

  const plainFenceStart = headerEnd - 3;
  if (plainFenceStart >= lineStart && text.startsWith("```", plainFenceStart)) {
    return plainFenceStart;
  }

  for (const language of MARKDOWN_FENCE_LANGUAGES) {
    const fenceStart = headerEnd - language.length - 3;
    if (
      fenceStart >= lineStart &&
      text.startsWith("```", fenceStart) &&
      text.startsWith(language, fenceStart + 3)
    ) {
      return fenceStart;
    }
  }

  return undefined;
}

/** Find a closing fence whose line prefix contains only whitespace. */
function findClosingFence(
  text: string,
  lineStart: number,
  lineEnd: number,
): number | undefined {
  let cursor = lineStart;
  while (cursor < lineEnd && isWhitespaceCharacter(text[cursor] ?? "")) {
    cursor++;
  }
  return text.startsWith("```", cursor) ? cursor : undefined;
}

/**
 * Extract fenced markdown bodies with a line-oriented, single-pass scanner.
 */
function extractMarkdownCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  let contentStart: number | undefined;
  let lineStart = 0;

  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const hasNewline = newline !== -1;
    const lineEnd = hasNewline ? newline : text.length;

    if (contentStart === undefined) {
      // The supported opening form requires a newline after the fence header.
      if (
        hasNewline &&
        findOpeningFence(text, lineStart, lineEnd) !== undefined
      ) {
        contentStart = lineEnd + 1;
      }
    } else if (findClosingFence(text, lineStart, lineEnd) !== undefined) {
      const contentEnd = lineStart > contentStart ? lineStart - 1 : lineStart;
      blocks.push(text.slice(contentStart, contentEnd));
      contentStart = undefined;
    }

    if (!hasNewline) break;
    lineStart = lineEnd + 1;
  }

  return blocks;
}

/**
 * Extract tool calls from markdown code blocks.
 */
function extractMarkdownToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];

  for (const content of extractMarkdownCodeBlocks(text)) {
    const parsed = rjsonParse(content.trim());
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
            ? (() => {
                const p = rjsonParse(fn.arguments as string);
                return p.ok && typeof p.value === "object"
                  ? (p.value as Record<string, unknown>)
                  : {};
              })()
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
    const ciMatch = tools.find(
      (t) => t.name.toLowerCase() === call.name.toLowerCase(),
    );
    if (ciMatch) {
      result.coercions.push(
        `tool name case fix: "${call.name}" -> "${ciMatch.name}"`,
      );
      call = { ...call, name: ciMatch.name };
      const coerced = coerceToSchema(ciMatch.parameters, call.arguments);
      if (coerced.coerced) {
        result.coercions.push(...coerced.actions);
        return {
          name: call.name,
          arguments: coerced.value as Record<string, unknown>,
        };
      }
      return call;
    }
    result.errors.push(`Unknown tool: "${call.name}"`);
    return null;
  }

  // Apply schema coercion
  const coerced: CoerceResult = coerceToSchema(
    toolDef.parameters,
    call.arguments,
  );
  if (coerced.coerced) {
    result.coercions.push(...coerced.actions);
    return {
      name: call.name,
      arguments: coerced.value as Record<string, unknown>,
    };
  }

  return call;
}
