import type { JsonPrimitive, JsonValue } from "../../definition/json-value.js";
import { RULE_OPERATOR_KEYS } from "../../definition/rule-expression.js";
import type { NormalizedRuleExpression } from "../../model/rule.js";
import {
  ROOT_MODEL_PATH,
  isValidModelPath,
  toModelPath,
  type ModelPath,
} from "../../path/index.js";
import { CloneShapeError, clonePlain, deepFreeze, isPlainObject } from "../immutable.js";

export type RuleParseFailureReason =
  | "function"
  | "promise"
  | "cycle"
  | "accessor-property"
  | "non-json"
  | "multi-operator"
  | "invalid-operator"
  | "invalid-field"
  | "invalid-call"
  | "invalid-const"
  | "runtime-object";

export class RuleParseError extends Error {
  readonly reason: RuleParseFailureReason;
  readonly pointer: string;

  constructor(reason: RuleParseFailureReason, pointer: string, message?: string) {
    super(message ?? reason);
    this.name = "RuleParseError";
    this.reason = reason;
    this.pointer = pointer;
  }
}

const BINARY_OPERATORS = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "in"]);
const LIST_OPERATORS = new Set(["all", "any"]);

export function parseRuleExpression(input: unknown, pointer = ""): NormalizedRuleExpression {
  if (typeof input === "function") {
    throw new RuleParseError("function", pointer);
  }
  if (isThenable(input)) {
    throw new RuleParseError("promise", pointer);
  }
  if (input !== null && typeof input === "object" && !Array.isArray(input) && !isPlainObject(input)) {
    throw new RuleParseError("runtime-object", pointer);
  }
  try {
    const cloned = clonePlain(input, true);
    return deepFreeze(parseNode(cloned, pointer));
  } catch (error) {
    if (error instanceof RuleParseError) {
      throw error;
    }
    if (error instanceof CloneShapeError) {
      throw new RuleParseError(
        error.reason === "cycle"
          ? "cycle"
          : error.reason === "accessor-property"
            ? "accessor-property"
            : "non-json",
        pointer,
      );
    }
    throw error;
  }
}

export function collectFieldPaths(expression: NormalizedRuleExpression): ModelPath[] {
  const paths: ModelPath[] = [];
  visit(expression, (node) => {
    if (node.kind === "field") {
      paths.push(node.path);
    }
  });
  return uniquePaths(paths);
}

export function collectCallNames(expression: NormalizedRuleExpression): string[] {
  const names: string[] = [];
  visit(expression, (node) => {
    if (node.kind === "call") {
      names.push(node.name);
    }
  });
  return uniqueStrings(names);
}

function parseNode(value: unknown, pointer: string): NormalizedRuleExpression {
  if (value === undefined) {
    throw new RuleParseError("non-json", pointer);
  }
  if (typeof value === "function") {
    throw new RuleParseError("function", pointer);
  }
  if (isThenable(value)) {
    throw new RuleParseError("promise", pointer);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return { kind: "literal", value };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RuleParseError("non-json", pointer);
    }
    return { kind: "literal", value };
  }
  if (typeof value !== "object") {
    throw new RuleParseError("non-json", pointer);
  }
  if (Array.isArray(value)) {
    throw new RuleParseError("invalid-const", pointer, "array literals must be wrapped in const");
  }
  if (!isPlainObject(value)) {
    throw new RuleParseError("runtime-object", pointer);
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    throw new RuleParseError("invalid-operator", pointer);
  }

  if (keys.includes("const")) {
    if (keys.length !== 1) {
      throw new RuleParseError("multi-operator", pointer);
    }
    return { kind: "const", value: asJsonValue(value.const, joinPointer(pointer, "const")) };
  }

  if (keys.includes("field")) {
    if (keys.length !== 1) {
      throw new RuleParseError("multi-operator", pointer);
    }
    return { kind: "field", path: parseField(value.field, joinPointer(pointer, "field")) };
  }

  if (keys.includes("call")) {
    if (!keys.includes("args") || keys.length !== 2) {
      throw new RuleParseError("invalid-call", pointer);
    }
    if (typeof value.call !== "string" || value.call.length === 0 || value.call.trim() !== value.call) {
      throw new RuleParseError("invalid-call", joinPointer(pointer, "call"));
    }
    if (!Array.isArray(value.args)) {
      throw new RuleParseError("invalid-call", joinPointer(pointer, "args"));
    }
    return {
      kind: "call",
      name: value.call,
      args: value.args.map((item, index) => parseNode(item, joinPointer(pointer, "args", String(index)))),
    };
  }

  const operators = keys.filter((key) => (RULE_OPERATOR_KEYS as readonly string[]).includes(key));
  if (operators.length !== 1 || keys.length !== 1) {
    throw new RuleParseError(operators.length > 1 ? "multi-operator" : "invalid-operator", pointer);
  }

  const operator = operators[0]!;
  const operand = value[operator];
  if (operator === "not") {
    return { kind: "not", operand: parseNode(operand, joinPointer(pointer, "not")) };
  }
  if (LIST_OPERATORS.has(operator)) {
    if (!Array.isArray(operand)) {
      throw new RuleParseError("invalid-operator", joinPointer(pointer, operator));
    }
    return {
      kind: operator as "all" | "any",
      items: operand.map((item, index) => parseNode(item, joinPointer(pointer, operator, String(index)))),
    };
  }
  if (BINARY_OPERATORS.has(operator)) {
    if (!Array.isArray(operand) || operand.length !== 2) {
      throw new RuleParseError("invalid-operator", joinPointer(pointer, operator));
    }
    return {
      kind: operator as "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in",
      left: parseNode(operand[0], joinPointer(pointer, operator, "0")),
      right: parseNode(operand[1], joinPointer(pointer, operator, "1")),
    };
  }
  throw new RuleParseError("invalid-operator", pointer);
}

function parseField(value: unknown, pointer: string): ModelPath {
  if (typeof value !== "string" || !isValidModelPath(value)) {
    throw new RuleParseError("invalid-field", pointer);
  }
  return toModelPath(value) ?? ROOT_MODEL_PATH;
}

function asJsonValue(value: unknown, pointer: string): JsonValue {
  if (typeof value === "function") {
    throw new RuleParseError("function", pointer);
  }
  if (isThenable(value)) {
    throw new RuleParseError("promise", pointer);
  }
  if (value === undefined) {
    throw new RuleParseError("non-json", pointer);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RuleParseError("non-json", pointer);
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new RuleParseError("non-json", pointer);
  }
  try {
    return clonePlain(value, true) as JsonValue;
  } catch (error) {
    if (error instanceof CloneShapeError) {
      throw new RuleParseError(
        error.reason === "cycle"
          ? "cycle"
          : error.reason === "accessor-property"
            ? "accessor-property"
            : "non-json",
        pointer,
      );
    }
    throw error;
  }
}

function visit(
  expression: NormalizedRuleExpression,
  visitor: (node: NormalizedRuleExpression) => void,
): void {
  visitor(expression);
  switch (expression.kind) {
    case "call":
      for (const arg of expression.args) {
        visit(arg, visitor);
      }
      return;
    case "eq":
    case "ne":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
    case "in":
      visit(expression.left, visitor);
      visit(expression.right, visitor);
      return;
    case "all":
    case "any":
      for (const item of expression.items) {
        visit(item, visitor);
      }
      return;
    case "not":
      visit(expression.operand, visitor);
      return;
    default:
      return;
  }
}

function uniquePaths(paths: readonly ModelPath[]): ModelPath[] {
  const seen = new Set<string>();
  const result: ModelPath[] = [];
  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function joinPointer(parent: string, ...tokens: readonly string[]): string {
  let current = parent;
  for (const token of tokens) {
    current = `${current}/${token}`;
  }
  return current;
}

function isThenable(value: unknown): boolean {
  return (
    (typeof value === "object" && value !== null && "then" in value && typeof (value as { then?: unknown }).then === "function") ||
    (typeof value === "function" && "then" in value && typeof (value as { then?: unknown }).then === "function")
  );
}

export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
