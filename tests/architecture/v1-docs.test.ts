import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadCoverageMatrix } from "../../tools/architecture-check/v1/matrix.js";
import { renderCoverageIndex } from "../../tools/architecture-check/v1/docs.js";
import { REPO_ROOT } from "../lib/fs.js";

describe("v1 documentation", () => {
  test("V1-DOCS-INDEX documents public paths, examples, gate, and deferred items", () => {
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    const workspace = fs.readFileSync(path.join(REPO_ROOT, "docs/workspace.md"), "utf8");
    expect(readme).toContain("pnpm verify:v1");
    expect(readme).toContain("examples/playground");
    expect(readme).toContain("examples/shared");
    expect(workspace).toContain("verify:v1");
    expect(workspace).toContain("@form/core/runtime");
    expect(workspace).toContain("deferred");
    const architecture = fs.readFileSync(path.join(REPO_ROOT, "docs/architecture.md"), "utf8");
    const loaded = loadCoverageMatrix(path.join(REPO_ROOT, "tests/architecture/v1-coverage.json"));
    const generated = fs.readFileSync(path.join(REPO_ROOT, "docs/generated/v1-coverage.md"), "utf8");
    expect(generated).toBe(renderCoverageIndex(loaded.matrix!));
    expect(generated).toContain("DEF-01");
    expect(architecture).toContain("## 3. 架构不变量");
  });
});
