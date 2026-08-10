import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parseToolCalls } from "../src/tool-reliability/parser.js";
import { rjsonParse } from "../src/tool-reliability/rjson.js";

const boundedRepeat = 256;

describe("CodeQL polynomial ReDoS regressions", () => {
  it("parses adjacent XML variants and singular argument tags", () => {
    const input = [
      '<tool_call  >\n<name >first</name><arguments>{"value": 1}</arguments></tool_call>',
      '<function_call>\n<name>second</name><argument>{"value": 2}</argument></function_call>',
    ].join("\n");

    const result = parseToolCalls(input);

    expect(result.format).toBe("xml");
    expect(result.calls).toEqual([
      { name: "first", arguments: { value: 1 } },
      { name: "second", arguments: { value: 2 } },
    ]);
  });

  it("parses multiple fenced JSON blocks with indented closers", () => {
    const input = [
      "```json",
      '{"name":"first","arguments":{"value":1}}',
      "   ``` ignored closing suffix",
      "text between blocks",
      "```javascript   ",
      '{"name":"second","arguments":{"value":2}}',
      "\t```",
    ].join("\n");

    const result = parseToolCalls(input);

    expect(result.format).toBe("markdown");
    expect(result.calls).toEqual([
      { name: "first", arguments: { value: 1 } },
      { name: "second", arguments: { value: 2 } },
    ]);
  });

  it("handles bounded malformed outer XML without backtracking", () => {
    const input = `<tool_call>${"<tool_call>a".repeat(boundedRepeat)}`;
    const result = parseToolCalls(input);

    expect(result.calls).toEqual([]);
    expect(result.errors).toContain("No tool calls found in text");
  });

  it("keeps an earlier XML call when a later match is malformed", () => {
    const input = [
      '<tool_call><name>first</name><arguments>{"value": 1}</arguments></tool_call>',
      `<tool_call>${"<tool_call>a".repeat(boundedRepeat)}`,
    ].join("\n");

    const result = parseToolCalls(input);

    expect(result.calls).toEqual([{ name: "first", arguments: { value: 1 } }]);
    expect(result.format).toBe("xml");
  });

  it("handles bounded malformed name content without backtracking", () => {
    const input = `<tool_call><name>${"<name>a".repeat(
      boundedRepeat,
    )}</tool_call>`;
    const result = parseToolCalls(input);

    expect(result.calls).toEqual([]);
    expect(result.errors).toContain("No tool calls found in text");
  });

  it("handles bounded malformed argument content without backtracking", () => {
    const input = `<tool_call><name>safe</name><argument>${"<argument>a".repeat(
      boundedRepeat,
    )}</tool_call>`;
    const result = parseToolCalls(input);

    expect(result.calls).toEqual([{ name: "safe", arguments: {} }]);
    expect(result.format).toBe("xml");
  });

  it("handles bounded malformed markdown fences without backtracking", () => {
    const input = `\`\`\`\n${"\n ".repeat(boundedRepeat)}not-a-fence`;
    const result = parseToolCalls(input);

    expect(result.calls).toEqual([]);
    expect(result.errors).toContain("No tool calls found in text");
  });

  it("keeps an earlier markdown call when a later match is malformed", () => {
    const valid = [
      "```json",
      '{"name":"first","arguments":{"value":1}}',
      "```",
    ].join("\n");
    const malformed = `\`\`\`\n${"\n ".repeat(boundedRepeat)}not-a-fence`;

    const result = parseToolCalls(`${valid}\n${malformed}`);

    expect(result.calls).toEqual([{ name: "first", arguments: { value: 1 } }]);
    expect(result.format).toBe("markdown");
  });

  it.each(["", "json", "JSON", "javascript", "js"])(
    "preserves robust-JSON parsing for the %s fence label",
    (language) => {
      const input = `\`\`\`${language}\n{"value":1}\n\`\`\``;
      expect(rjsonParse(input)).toMatchObject({
        ok: true,
        value: { value: 1 },
      });
    },
  );

  it("handles bounded malformed robust-JSON fences without backtracking", () => {
    const input = `\`\`\`${"\n".repeat(boundedRepeat)}not-json`;
    expect(rjsonParse(input).ok).toBe(false);
  });

  it("time-isolates all bounded malformed shapes behind a hard timeout", () => {
    // npm test builds dist in pretest. Running the public entry points in a
    // separate process means a future synchronous parser regression cannot
    // wedge the Vitest worker indefinitely.
    const parserUrl = pathToFileURL(
      resolve("dist/tool-reliability/parser.js"),
    ).href;
    const rjsonUrl = pathToFileURL(
      resolve("dist/tool-reliability/rjson.js"),
    ).href;
    const script = `
      import { parseToolCalls } from ${JSON.stringify(parserUrl)};
      import { rjsonParse } from ${JSON.stringify(rjsonUrl)};
      const count = 1024;
      const fence = String.fromCharCode(96).repeat(3);
      const results = [
        parseToolCalls("<tool_call>" + "<tool_call>a".repeat(count)).calls.length,
        parseToolCalls("<tool_call><name>first</name></tool_call>\\n<tool_call>" + "<tool_call>a".repeat(count)).calls.length,
        parseToolCalls("<tool_call><name>" + "<name>a".repeat(count) + "</tool_call>").calls.length,
        parseToolCalls("<tool_call><name>safe</name><argument>" + "<argument>a".repeat(count) + "</tool_call>").calls.length,
        parseToolCalls(fence + "\\n" + "\\n ".repeat(count) + "not-a-fence").calls.length,
        parseToolCalls(fence + "json\\n{\\"name\\":\\"first\\",\\"arguments\\":{}}\\n" + fence + "\\n" + fence + "\\n" + "\\n ".repeat(count) + "not-a-fence").calls.length,
        rjsonParse(fence + "\\n".repeat(count) + "not-json").ok,
      ];
      process.stdout.write(JSON.stringify(results));
    `;

    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      {
        encoding: "utf8",
        timeout: 2_000,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
      },
    );

    expect(JSON.parse(output)).toEqual([0, 1, 0, 1, 0, 1, false]);
  });
});
