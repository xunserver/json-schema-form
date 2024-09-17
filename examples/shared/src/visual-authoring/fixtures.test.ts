import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  PACKAGE_ARCHITECTURE_VISUAL_SCENARIO_MAP,
  SUPPORTED_FIXTURES,
  UNSUPPORTED_FIXTURES,
  VISUAL_SCHEMA_EDITOR_SCENARIO_MAP,
} from "./index.js";

const specDir = path.resolve(fileURLToPath(new URL("../../../../openspec/specs", import.meta.url)));

function readScenarios(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/^#### Scenario:\s*(.+)\s*$/gm)].map((match) => match[1]!.trim());
}

describe("visual authoring fixtures", () => {
  test("VSE-FIXTURE-SCENARIO-MAP covers every visual-schema-editor scenario", () => {
    const specScenarios = readScenarios(path.join(specDir, "visual-schema-editor/spec.md"));
    expect(VISUAL_SCHEMA_EDITOR_SCENARIO_MAP.map((item) => item.scenario).sort()).toEqual([...specScenarios].sort());
    const fixtureIds = new Set([...SUPPORTED_FIXTURES, ...UNSUPPORTED_FIXTURES].map((item) => item.id));
    for (const item of VISUAL_SCHEMA_EDITOR_SCENARIO_MAP) {
      expect(item.testIds.length).toBeGreaterThan(0);
      for (const fixture of item.fixtures) {
        expect(fixtureIds.has(fixture), fixture).toBe(true);
      }
    }
  });

  test("VSE-NODE-PURE-CONVERT maps package-architecture visual scenarios", () => {
    const specScenarios = new Set(readScenarios(path.join(specDir, "package-architecture/spec.md")));
    const mapped = PACKAGE_ARCHITECTURE_VISUAL_SCENARIO_MAP.map((item) => item.scenario);
    expect(new Set(mapped).size).toBe(mapped.length);
    for (const scenario of mapped) {
      expect(specScenarios.has(scenario), scenario).toBe(true);
    }
  });
});
