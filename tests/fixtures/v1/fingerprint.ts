import type { CompiledFormModel, ViewNode } from "@xunserver-jsf/core";

export function semanticFingerprint(model: CompiledFormModel): string {
  return JSON.stringify(normalize(model, new Map()));
}

function normalize(value: unknown, ids: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, ids));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (key === "id" || key === "dataNodeId" || key.endsWith("Id")) {
        out[key] = internId(String(record[key]), ids);
        continue;
      }
      if (key === "diagnostics") {
        out[key] = Array.isArray(record[key])
          ? (record[key] as unknown[]).map((item) => stripVolatile(item, ids))
          : record[key];
        continue;
      }
      out[key] = normalize(record[key], ids);
    }
    return out;
  }
  return value;
}

function stripVolatile(value: unknown, ids: Map<string, string>): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const { metadata: _metadata, ...rest } = record;
    void _metadata;
    return normalize(rest, ids);
  }
  return normalize(value, ids);
}

function internId(id: string, ids: Map<string, string>): string {
  const existing = ids.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const token = `#${ids.size}`;
  ids.set(id, token);
  return token;
}

export function walkView(node: ViewNode): ViewNode[] {
  const nodes: ViewNode[] = [node];
  if ("children" in node) {
    for (const child of node.children) {
      nodes.push(...walkView(child));
    }
  }
  if ("itemLayout" in node) {
    for (const child of node.itemLayout) {
      nodes.push(...walkView(child));
    }
  }
  return nodes;
}
