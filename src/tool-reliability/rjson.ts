/**
 * Robust JSON Parser (rjson)
 *
 * A relaxed JSON parser that recovers from common LLM output mistakes:
 * - Trailing commas in objects and arrays
 * - Single-quoted strings
 * - Unquoted object keys
 * - Comments (// line and /* block *\/)
 * - Missing closing brackets/braces
 * - Extra commas
 * - Markdown code fence wrapping
 * - Mixed text surrounding JSON
 *
 * @module tool-reliability/rjson
 */

/** Result of a robust parse attempt. */
export interface RJsonResult {
  /** The parsed value, or undefined on failure. */
  value: unknown;
  /** Whether parsing succeeded. */
  ok: boolean;
  /** Error message when ok is false. */
  error?: string;
}

/**
 * Strip // line comments and /* block comments *\/ from a string,
 * being careful not to strip inside quoted strings.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    // Double-quoted string
    if (src[i] === '"') {
      const start = i;
      i++; // skip opening "
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") i++; // skip escaped char
        i++;
      }
      i++; // skip closing "
      out += src.slice(start, i);
      continue;
    }
    // Single-quoted string
    if (src[i] === "'") {
      const start = i;
      i++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      out += src.slice(start, i);
      continue;
    }
    // Line comment
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

/**
 * Strip markdown code fences if present.
 * Handles ```json ... ``` and ``` ... ```
 */
function stripCodeFences(src: string): string {
  const trimmed = src.trim();
  const fencePattern = /^```(?:json|JSON|javascript|js)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = fencePattern.exec(trimmed);
  if (match) {
    return match[1]!;
  }
  return trimmed;
}

/**
 * Find the first JSON-like structure in mixed text.
 * Looks for the first `{` or `[` and tries to find its matching end.
 */
function extractJsonFromText(src: string): string {
  const startObj = src.indexOf("{");
  const startArr = src.indexOf("[");

  let startIdx: number;
  let openChar: string;
  let closeChar: string;

  if (startObj === -1 && startArr === -1) return src;

  if (startObj === -1) {
    startIdx = startArr;
    openChar = "[";
    closeChar = "]";
  } else if (startArr === -1) {
    startIdx = startObj;
    openChar = "{";
    closeChar = "}";
  } else if (startObj <= startArr) {
    startIdx = startObj;
    openChar = "{";
    closeChar = "}";
  } else {
    startIdx = startArr;
    openChar = "[";
    closeChar = "]";
  }

  // Walk forward to find matching bracket
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i]!;
    if (inString) {
      if (ch === "\\" && i + 1 < src.length) {
        i++; // skip escaped
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === openChar || ch === (openChar === "{" ? "[" : "{")) {
      depth++;
    } else if (ch === closeChar || ch === (closeChar === "}" ? "]" : "}")) {
      depth--;
      if (depth === 0) {
        return src.slice(startIdx, i + 1);
      }
    }
  }

  // If brackets are not balanced, return from start to end
  return src.slice(startIdx);
}

/**
 * Fix trailing/extra commas: remove commas before } or ]
 */
function fixTrailingCommas(src: string): string {
  let out = "";
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < src.length) {
        out += src[i + 1];
        i++;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      continue;
    }
    if (ch === ",") {
      // Look ahead past whitespace for } or ] or another comma
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j]!)) j++;
      const next = src[j];
      if (next === "}" || next === "]" || next === ",") {
        // Skip this comma (trailing or double comma)
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Convert single-quoted strings to double-quoted strings,
 * and convert unquoted keys to double-quoted keys.
 */
function normalizeSyntax(src: string): string {
  let out = "";
  let i = 0;

  while (i < src.length) {
    const ch = src[i]!;

    // Double-quoted string -- pass through
    if (ch === '"') {
      const start = i;
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") i++;
        i++;
      }
      i++; // closing "
      out += src.slice(start, i);
      continue;
    }

    // Single-quoted string -- convert to double-quoted
    if (ch === "'") {
      i++; // skip opening '
      let content = "";
      while (i < src.length && src[i] !== "'") {
        if (src[i] === "\\") {
          content += src[i];
          i++;
          if (i < src.length) {
            content += src[i];
            i++;
          }
          continue;
        }
        // Escape any unescaped double quotes inside
        if (src[i] === '"') {
          content += '\\"';
        } else {
          content += src[i];
        }
        i++;
      }
      i++; // skip closing '
      out += `"${content}"`;
      continue;
    }

    // Unquoted key: identifier followed by ':'
    if (isIdentStart(ch)) {
      // Check if we are in a position where an unquoted key would appear
      // (after { or , with optional whitespace)
      const preceding = out.trimEnd();
      const lastSignificant = preceding[preceding.length - 1];
      if (
        lastSignificant === "{" ||
        lastSignificant === ","
      ) {
        let key = "";
        while (i < src.length && isIdentPart(src[i]!)) {
          key += src[i];
          i++;
        }
        // Skip whitespace to check for colon
        while (i < src.length && /\s/.test(src[i]!)) i++;
        if (src[i] === ":") {
          out += `"${key}"`;
          continue;
        }
        // Not a key, just output the identifier
        out += key;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

function isIdentStart(ch: string): boolean {
  return /[a-zA-Z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[a-zA-Z0-9_$]/.test(ch);
}

/**
 * Attempt to close unclosed brackets/braces.
 */
function autoClose(src: string): string {
  const stack: string[] = [];
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inString) {
      if (ch === "\\" && i + 1 < src.length) {
        i++;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringChar = '"';
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if (ch === "}" || ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }

  // Close unclosed string
  if (inString) {
    src += stringChar;
  }

  // Close unclosed brackets
  while (stack.length > 0) {
    src += stack.pop();
  }

  return src;
}

/**
 * Robustly parse JSON that may contain common LLM output issues.
 *
 * Strategy:
 * 1. Try native JSON.parse first (fast path).
 * 2. Strip code fences and try again.
 * 3. Extract JSON from mixed text.
 * 4. Strip comments, normalize syntax, fix commas, auto-close.
 * 5. Try JSON.parse on the cleaned output.
 */
export function rjsonParse(input: string): RJsonResult {
  if (!input || !input.trim()) {
    return { value: undefined, ok: false, error: "Empty input" };
  }

  // Fast path: native parse
  try {
    return { value: JSON.parse(input), ok: true };
  } catch {
    // continue to relaxed parsing
  }

  let src = input;

  // Strip markdown code fences
  src = stripCodeFences(src);
  try {
    return { value: JSON.parse(src), ok: true };
  } catch {
    // continue
  }

  // Extract JSON from surrounding text
  src = extractJsonFromText(src);
  try {
    return { value: JSON.parse(src), ok: true };
  } catch {
    // continue
  }

  // Full relaxed pipeline
  src = stripComments(src);
  src = normalizeSyntax(src);
  src = fixTrailingCommas(src);
  src = autoClose(src);

  try {
    return { value: JSON.parse(src), ok: true };
  } catch (err) {
    return {
      value: undefined,
      ok: false,
      error: `Robust parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
