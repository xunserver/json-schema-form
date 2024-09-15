import type { JsonValue } from "../../definition/json-value.js";
import {
  ROOT_INSTANCE_PATH,
  joinInstancePath,
  type InstancePath,
} from "../../model/path/index.js";
import { isPlainJsonObject } from "./json-value.js";

export function pruneInactiveValues(
  values: JsonValue,
  isActive: (path: InstancePath) => boolean,
  includeInactive: boolean,
  path: InstancePath = ROOT_INSTANCE_PATH,
): JsonValue {
  if (!includeInactive && path !== ROOT_INSTANCE_PATH && !isActive(path)) {
    return null;
  }
  if (Array.isArray(values)) {
    const items: JsonValue[] = [];
    values.forEach((item, index) => {
      const childPath = joinInstancePath(path, { kind: "index", index });
      if (!includeInactive && !isActive(childPath)) {
        return;
      }
      items.push(pruneInactiveValues(item, isActive, includeInactive, childPath));
    });
    return items;
  }
  if (isPlainJsonObject(values)) {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(values)) {
      const childPath = joinInstancePath(path, { kind: "property", name: key });
      if (!includeInactive && !isActive(childPath)) {
        continue;
      }
      const child = values[key];
      if (child === undefined) {
        continue;
      }
      result[key] = pruneInactiveValues(child, isActive, includeInactive, childPath);
    }
    return result;
  }
  return values;
}
