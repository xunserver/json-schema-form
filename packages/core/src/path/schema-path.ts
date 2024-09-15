import type { SchemaPath } from "./types.js";

export const ROOT_SCHEMA_PATH = "#" as SchemaPath;

export function asSchemaPath(value: string): SchemaPath {
  return value as SchemaPath;
}

export function escapeJsonPointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function unescapeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function formatSchemaPath(tokens: readonly string[]): SchemaPath {
  if (tokens.length === 0) {
    return ROOT_SCHEMA_PATH;
  }
  return asSchemaPath(`#/${tokens.map(escapeJsonPointerToken).join("/")}`);
}

export function parseSchemaPath(path: SchemaPath | string): readonly string[] | undefined {
  if (path === "#" || path === "") {
    return [];
  }
  if (!path.startsWith("#/")) {
    return undefined;
  }
  return path
    .slice(2)
    .split("/")
    .map((token) => unescapeJsonPointerToken(token));
}

export function childSchemaPath(parent: SchemaPath, token: string | number): SchemaPath {
  const parsed = parseSchemaPath(parent);
  if (parsed === undefined) {
    return formatSchemaPath([String(token)]);
  }
  return formatSchemaPath([...parsed, String(token)]);
}
