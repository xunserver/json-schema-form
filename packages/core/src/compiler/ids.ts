import type { DataNodeId, ViewNodeId } from "../model/identity/index.js";
import type { ModelPath } from "../model/path/index.js";

export function dataNodeId(path: ModelPath, role = "node"): DataNodeId {
  return `data:${path}:${role}` as DataNodeId;
}

export function viewNodeId(occurrence: number, kind: string, detail = ""): ViewNodeId {
  return `view:${occurrence}:${kind}:${detail}` as ViewNodeId;
}
