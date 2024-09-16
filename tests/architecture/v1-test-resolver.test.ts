import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolveCommands, resolveTests } from "../../tools/architecture-check/v1/test-resolver.js";
import { makeTempDir, writeJson, writeText } from "../lib/fs.js";
import type { CommandRecord, TestRecord } from "../../tools/architecture-check/v1/types.js";

describe("v1 test and command resolver", () => {
  test("V1-TEST-RESOLVER-UNIQUE accepts a unique V1 id in the registered file", () => {
    const root = makeTempDir("test-unique-");
    writeJson(path.join(root, "package.json"), { scripts: { test: "vitest run" } });
    writeText(path.join(root, "tests/sample.test.ts"), 'test("V1-SAMPLE-ID unique title", () => {});\n');
    const tests: TestRecord[] = [
      {
        id: "V1-SAMPLE-ID",
        kind: "unit",
        file: "tests/sample.test.ts",
        title: "V1-SAMPLE-ID unique title",
        commandId: "test",
      },
    ];
    const commands: CommandRecord[] = [{ id: "test", kind: "root-script", name: "test" }];
    expect(resolveTests(root, tests, commands)).toEqual([]);
    expect(resolveCommands(root, commands)).toEqual([]);
  });

  test("V1-TEST-RESOLVER-MISSING-FILE rejects a missing file or title", () => {
    const root = makeTempDir("test-missing-");
    writeJson(path.join(root, "package.json"), { scripts: { test: "vitest run" } });
    writeText(path.join(root, "tests/sample.test.ts"), 'test("other", () => {});\n');
    const issues = resolveTests(
      root,
      [
        {
          id: "V1-MISSING-FILE",
          kind: "unit",
          file: "tests/does-not-exist.test.ts",
          title: "gone",
          commandId: "test",
        },
        {
          id: "V1-MISSING-TITLE",
          kind: "unit",
          file: "tests/sample.test.ts",
          title: "not in file",
          commandId: "test",
        },
      ],
      [{ id: "test", kind: "root-script", name: "test" }],
    );
    expect(issues.some((issue) => issue.code === "missing-test-file")).toBe(true);
    expect(issues.some((issue) => issue.code === "missing-test-title" || issue.code === "missing-test-id")).toBe(true);
  });

  test("V1-TEST-RESOLVER-DUPLICATE rejects a repeated test id literal", () => {
    const root = makeTempDir("test-dup-");
    writeJson(path.join(root, "package.json"), { scripts: { test: "vitest run" } });
    writeText(path.join(root, "tests/sample.test.ts"), "V1-DUP-ID\nV1-DUP-ID\n");
    const issues = resolveTests(
      root,
      [
        {
          id: "V1-DUP-ID",
          kind: "unit",
          file: "tests/sample.test.ts",
          title: "V1-DUP-ID",
          commandId: "test",
        },
      ],
      [{ id: "test", kind: "root-script", name: "test" }],
    );
    expect(issues.some((issue) => issue.code === "duplicate-test-literal")).toBe(true);
  });

  test("V1-COMMAND-ARBITRARY-SHELL rejects commands that are not root scripts or builtins", () => {
    const root = makeTempDir("cmd-shell-");
    writeJson(path.join(root, "package.json"), { scripts: { test: "vitest run" } });
    const issues = resolveCommands(root, [
      { id: "rm", kind: "root-script", name: "rm -rf /" },
      { id: "evil", kind: "builtin", name: "curl http://example" },
    ]);
    expect(issues.some((issue) => issue.code === "unknown-root-script")).toBe(true);
    expect(issues.some((issue) => issue.code === "unknown-builtin")).toBe(true);
    expect(fs.existsSync(path.join(root, "package.json"))).toBe(true);
  });
});
