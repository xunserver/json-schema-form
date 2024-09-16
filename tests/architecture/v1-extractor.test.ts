import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { extractArchitecture } from "../../tools/architecture-check/v1/extractor.js";
import { REPO_ROOT, makeTempDir, writeText } from "../lib/fs.js";

describe("v1 architecture extractor", () => {
  test("V1-EXTRACTOR-EXACT-SET extracts the 12/10/8 architecture sets", () => {
    const markdown = fs.readFileSync(path.join(REPO_ROOT, "docs/architecture.md"), "utf8");
    const { extracted, issues } = extractArchitecture(markdown);
    expect(issues).toEqual([]);
    expect(extracted?.invariants).toHaveLength(12);
    expect(extracted?.slices).toHaveLength(10);
    expect(extracted?.acceptanceCriteria).toHaveLength(8);
    expect(extracted?.deferred).toHaveLength(8);
    expect(extracted?.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  test("V1-EXTRACTOR-DRIFT reports entry id and section when architecture text changes", () => {
    const markdown = fs.readFileSync(path.join(REPO_ROOT, "docs/architecture.md"), "utf8");
    const mutated = markdown.replace(
      "JSON Schema = Data Contract",
      "JSON Schema = Something Else",
    );
    const original = extractArchitecture(markdown).extracted;
    const changed = extractArchitecture(mutated).extracted;
    expect(original?.invariants[0]?.normalizedText).not.toBe(changed?.invariants[0]?.normalizedText);
    expect(changed?.invariants[0]?.id).toBe("INV-01");
    expect(changed?.invariants[0]?.section).toBe(3);
    expect(changed?.digest).not.toBe(original?.digest);

    const extra = markdown.replace(
      "为所有 UI 库一次性提供 Adapter。",
      "为所有 UI 库一次性提供 Adapter。\n- extra deferred item;",
    );
    const extraResult = extractArchitecture(extra);
    expect(extraResult.issues.some((issue) => issue.code === "extra-item" || issue.code === "count-mismatch")).toBe(
      true,
    );

    const root = makeTempDir("arch-extract-");
    writeText(path.join(root, "architecture.md"), mutated);
    expect(fs.readFileSync(path.join(root, "architecture.md"), "utf8")).toContain("Something Else");
  });
});
