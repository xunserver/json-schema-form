import type { JsonValue } from "../../definition/json-value.js";
import type { ActivationPredicate } from "../../model/schema-dynamics/schema-dynamics.js";
import { bindTemplatePath } from "../../model/path/bind-path.js";
import { parseInstancePath } from "../../model/path/instance-path.js";
import type { InstancePath, ModelPath } from "../../model/path/types.js";
import { getJsonAt, isPlainJsonObject, jsonEqual } from "../value/json-value.js";

export function evaluateActivationPredicate(
  predicate: ActivationPredicate,
  values: JsonValue,
  ownerTemplate: ModelPath,
  ownerInstance: InstancePath,
): boolean {
  switch (predicate.type) {
    case "true":
      return true;
    case "false":
      return false;
    case "type": {
      const value = read(predicate.path, values, ownerTemplate, ownerInstance);
      const actual = jsonType(value);
      if (actual === undefined) {
        return false;
      }
      if (predicate.jsonTypes.includes(actual)) {
        return true;
      }
      return actual === "integer" && predicate.jsonTypes.includes("number");
    }
    case "const":
      return jsonEqual(read(predicate.path, values, ownerTemplate, ownerInstance), predicate.value);
    case "enum": {
      const value = read(predicate.path, values, ownerTemplate, ownerInstance);
      return predicate.values.some((item) => jsonEqual(item, value));
    }
    case "present": {
      const container = read(predicate.path, values, ownerTemplate, ownerInstance);
      return isPlainJsonObject(container) && Object.prototype.hasOwnProperty.call(container, predicate.property);
    }
    case "all":
      return predicate.of.every((child) =>
        evaluateActivationPredicate(child, values, ownerTemplate, ownerInstance),
      );
    case "any":
      return predicate.of.some((child) =>
        evaluateActivationPredicate(child, values, ownerTemplate, ownerInstance),
      );
    case "not":
      return !evaluateActivationPredicate(predicate.of, values, ownerTemplate, ownerInstance);
  }
}

function read(
  path: ModelPath,
  values: JsonValue,
  ownerTemplate: ModelPath,
  ownerInstance: InstancePath,
): JsonValue | undefined {
  const instance = bindTemplatePath(path, ownerTemplate, ownerInstance);
  return getJsonAt(values, parseInstancePath(instance) ?? []);
}

function jsonType(value: JsonValue | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "string") {
    return "string";
  }
  return "object";
}
