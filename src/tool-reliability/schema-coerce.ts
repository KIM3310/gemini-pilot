/**
 * Schema Coercion
 *
 * Given a Zod schema and a raw value, coerce the value to match the schema.
 * Handles common LLM output type mismatches:
 * - String to number ("42" -> 42)
 * - String to boolean ("true" -> true)
 * - Single value to array wrapping
 * - snake_case <-> camelCase key normalization
 * - Nested object/array coercion with depth limit
 * - Strip unknown extra fields
 *
 * @module tool-reliability/schema-coerce
 */

import { type ZodTypeAny, ZodObject, ZodArray, ZodNumber, ZodBoolean, ZodString, ZodOptional, ZodDefault, ZodEnum, ZodNullable } from "zod";

/** Maximum recursion depth for nested coercion. */
const MAX_DEPTH = 20;

/** Result of a coercion attempt. */
export interface CoerceResult {
  /** The coerced value. */
  value: unknown;
  /** Whether coercion was applied (vs. passthrough). */
  coerced: boolean;
  /** List of coercion actions taken. */
  actions: string[];
}

/**
 * Convert a string from snake_case to camelCase.
 */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Convert a string from camelCase to snake_case.
 */
export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Unwrap Zod wrapper types (ZodOptional, ZodDefault, ZodNullable) to get the inner type.
 */
function unwrapSchema(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof ZodOptional) {
    return unwrapSchema(schema.unwrap());
  }
  if (schema instanceof ZodDefault) {
    return unwrapSchema(schema.removeDefault());
  }
  if (schema instanceof ZodNullable) {
    return unwrapSchema(schema.unwrap());
  }
  return schema;
}

/**
 * Coerce a raw value to match the given Zod schema.
 */
export function coerceToSchema(
  schema: ZodTypeAny,
  value: unknown,
  depth = 0,
): CoerceResult {
  const actions: string[] = [];

  if (depth > MAX_DEPTH) {
    return { value, coerced: false, actions: ["depth limit reached"] };
  }

  if (value === undefined || value === null) {
    return { value, coerced: false, actions };
  }

  const innerSchema = unwrapSchema(schema);

  // Number coercion
  if (innerSchema instanceof ZodNumber && typeof value === "string") {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      actions.push(`string "${value}" -> number ${num}`);
      return { value: num, coerced: true, actions };
    }
  }

  // Boolean coercion
  if (innerSchema instanceof ZodBoolean && typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (lower === "true" || lower === "1" || lower === "yes") {
      actions.push(`string "${value}" -> boolean true`);
      return { value: true, coerced: true, actions };
    }
    if (lower === "false" || lower === "0" || lower === "no") {
      actions.push(`string "${value}" -> boolean false`);
      return { value: false, coerced: true, actions };
    }
  }

  // Boolean from number
  if (innerSchema instanceof ZodBoolean && typeof value === "number") {
    actions.push(`number ${value} -> boolean ${Boolean(value)}`);
    return { value: Boolean(value), coerced: true, actions };
  }

  // String coercion from number
  if (innerSchema instanceof ZodString && typeof value === "number") {
    actions.push(`number ${value} -> string "${value}"`);
    return { value: String(value), coerced: true, actions };
  }

  // Enum coercion: try case-insensitive match
  if (innerSchema instanceof ZodEnum && typeof value === "string") {
    const options = innerSchema.options as string[];
    const exact = options.find((o) => o === value);
    if (!exact) {
      const lower = value.toLowerCase();
      const match = options.find((o) => o.toLowerCase() === lower);
      if (match) {
        actions.push(`enum case fix: "${value}" -> "${match}"`);
        return { value: match, coerced: true, actions };
      }
    }
  }

  // Array wrapping: single value -> [value]
  if (innerSchema instanceof ZodArray && !Array.isArray(value)) {
    const elementSchema = innerSchema.element as ZodTypeAny;
    const inner = coerceToSchema(elementSchema, value, depth + 1);
    actions.push("single value -> array wrapping");
    actions.push(...inner.actions);
    return { value: [inner.value], coerced: true, actions };
  }

  // Array element coercion
  if (innerSchema instanceof ZodArray && Array.isArray(value)) {
    const elementSchema = innerSchema.element as ZodTypeAny;
    let anyCoerced = false;
    const coercedArr = value.map((item) => {
      const inner = coerceToSchema(elementSchema, item, depth + 1);
      if (inner.coerced) anyCoerced = true;
      actions.push(...inner.actions);
      return inner.value;
    });
    return { value: coercedArr, coerced: anyCoerced, actions };
  }

  // Object coercion: key normalization + field coercion + strip unknown
  if (innerSchema instanceof ZodObject && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const shape = innerSchema.shape as Record<string, ZodTypeAny>;
    const schemaKeys = Object.keys(shape);
    const inputObj = value as Record<string, unknown>;
    const inputKeys = Object.keys(inputObj);
    const result: Record<string, unknown> = {};
    let anyCoerced = false;

    // Build lookup maps for key normalization
    const schemaKeyMap = new Map<string, string>();
    for (const k of schemaKeys) {
      schemaKeyMap.set(k, k);
      schemaKeyMap.set(snakeToCamel(k), k);
      schemaKeyMap.set(camelToSnake(k), k);
      schemaKeyMap.set(k.toLowerCase(), k);
    }

    for (const inputKey of inputKeys) {
      // Find matching schema key
      const schemaKey =
        schemaKeyMap.get(inputKey) ??
        schemaKeyMap.get(snakeToCamel(inputKey)) ??
        schemaKeyMap.get(camelToSnake(inputKey)) ??
        schemaKeyMap.get(inputKey.toLowerCase());

      if (schemaKey && shape[schemaKey]) {
        if (inputKey !== schemaKey) {
          actions.push(`key rename: "${inputKey}" -> "${schemaKey}"`);
          anyCoerced = true;
        }
        const inner = coerceToSchema(shape[schemaKey]!, inputObj[inputKey], depth + 1);
        result[schemaKey] = inner.value;
        if (inner.coerced) anyCoerced = true;
        actions.push(...inner.actions);
      } else {
        // Strip unknown field
        actions.push(`strip unknown field: "${inputKey}"`);
        anyCoerced = true;
      }
    }

    return { value: result, coerced: anyCoerced, actions };
  }

  // No coercion needed
  return { value, coerced: false, actions };
}
