import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";

const RENDERER_PACKAGES = ["vue", "react", "element-plus", "mui"] as const;
const FORBIDDEN = [
  "applyErrors",
  "ValidationEngine",
  "ErrorStore",
  "from \"ajv\"",
  "from 'ajv'",
];

function collect(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      files.push(...collect(full));
    } else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("renderer packages do not own validation writes", () => {
  test("Vue React Element Plus and MUI sources do not import AJV or error writers", () => {
    for (const directory of RENDERER_PACKAGES) {
      const files = collect(path.join(REPO_ROOT, "packages", directory, "src"));
      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        for (const token of FORBIDDEN) {
          expect(source, `${file} leaked ${token}`).not.toContain(token);
        }
      }
    }
  });
});
