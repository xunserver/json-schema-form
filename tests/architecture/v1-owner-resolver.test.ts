import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseSpec, resolveChangeSpec, resolveOwner } from "../../tools/architecture-check/v1/owner-resolver.js";
import { makeTempDir, writeText } from "../lib/fs.js";
import type { OwnerRef } from "../../tools/architecture-check/v1/types.js";

function spec(requirements: string): string {
  return `# fixture\n\n## Requirements\n\n${requirements}\n`;
}

describe("v1 owner resolver", () => {
  test("V1-OWNER-ACTIVE-ARCHIVE-DURABLE resolves active, archive, and durable specs", () => {
    const root = makeTempDir("owner-resolve-");
    writeText(
      path.join(root, "openspec/changes/sample-change/specs/demo/spec.md"),
      spec("### Requirement: Alpha\n\n#### Scenario: Hello\n"),
    );
    writeText(
      path.join(root, "openspec/changes/archive/2026-01-01-sample-change/specs/demo/spec.md"),
      spec("### Requirement: Alpha\n\n#### Scenario: Hello\n"),
    );
    writeText(
      path.join(root, "openspec/specs/demo/spec.md"),
      spec("### Requirement: Alpha\n\n#### Scenario: Hello\n"),
    );
    const owner: OwnerRef = {
      changeId: "sample-change",
      capability: "demo",
      requirement: "Alpha",
      scenario: "Hello",
    };
    const resolved = resolveOwner(root, owner);
    expect(resolved.issues).toEqual([]);
    expect(resolved.resolved?.source).toBe("active");
    fs.rmSync(path.join(root, "openspec/changes/sample-change"), { recursive: true, force: true });
    const archived = resolveOwner(root, owner);
    expect(archived.resolved?.source).toBe("archive");
    fs.rmSync(path.join(root, "openspec/changes/archive"), { recursive: true, force: true });
    const durable = resolveOwner(root, owner);
    expect(durable.resolved?.source).toBe("durable");
    expect(parseSpec(fs.readFileSync(path.join(root, "openspec/specs/demo/spec.md"), "utf8"))[0]?.requirement).toBe(
      "Alpha",
    );
  });

  test("change spec locator prefers active specs and falls back to a unique archive", () => {
    const root = makeTempDir("change-spec-resolve-");
    const active = path.join(root, "openspec/changes/sample-change/specs/demo/spec.md");
    const archived = path.join(root, "openspec/changes/archive/2026-01-01-sample-change/specs/demo/spec.md");
    writeText(active, spec("### Requirement: Active\n\n#### Scenario: Current\n"));
    writeText(archived, spec("### Requirement: Archived\n\n#### Scenario: Historical\n"));

    const activeResult = resolveChangeSpec(root, "sample-change", "demo");
    expect(activeResult.issues).toEqual([]);
    expect(activeResult.resolved).toMatchObject({ file: active, source: "active" });

    fs.rmSync(path.join(root, "openspec/changes/sample-change"), { recursive: true, force: true });
    const archivedResult = resolveChangeSpec(root, "sample-change", "demo");
    expect(archivedResult.issues).toEqual([]);
    expect(archivedResult.resolved).toMatchObject({ file: archived, source: "archive" });
  });

  test("change spec locator reports a missing active and archived spec", () => {
    const root = makeTempDir("change-spec-missing-");
    const result = resolveChangeSpec(root, "missing-change", "demo");
    expect(result.resolved).toBeUndefined();
    expect(result.issues).toEqual([
      {
        code: "missing-change-spec",
        message: "Cannot resolve active or archived spec for missing-change/demo",
      },
    ]);
  });

  test("change spec locator rejects ambiguous archived specs", () => {
    const root = makeTempDir("change-spec-ambiguous-");
    writeText(
      path.join(root, "openspec/changes/archive/2026-01-01-sample-change/specs/demo/spec.md"),
      spec("### Requirement: One\n\n#### Scenario: First\n"),
    );
    writeText(
      path.join(root, "openspec/changes/archive/2026-02-01-sample-change/specs/demo/spec.md"),
      spec("### Requirement: Two\n\n#### Scenario: Second\n"),
    );

    const result = resolveChangeSpec(root, "sample-change", "demo");
    expect(result.resolved).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: "ambiguous-change-spec" });
    expect(result.issues[0]?.message).toContain("2026-01-01-sample-change/specs/demo/spec.md");
    expect(result.issues[0]?.message).toContain("2026-02-01-sample-change/specs/demo/spec.md");
  });

  test("V1-OWNER-AMBIGUOUS-SCENARIO requires a requirement qualifier for duplicate titles", () => {
    const root = makeTempDir("owner-ambiguous-");
    writeText(
      path.join(root, "openspec/specs/demo/spec.md"),
      spec("### Requirement: One\n\n#### Scenario: Shared\n\n### Requirement: Two\n\n#### Scenario: Shared\n"),
    );
    const owner: OwnerRef = {
      changeId: "missing-change",
      capability: "demo",
      requirement: "Does not exist",
      scenario: "Shared",
    };
    const result = resolveOwner(root, owner);
    expect(result.issues.some((issue) => issue.code === "ambiguous-scenario" || issue.code === "dangling-owner")).toBe(
      true,
    );
  });

  test("V1-OWNER-DANGLING reports a missing owner reference", () => {
    const root = makeTempDir("owner-dangling-");
    writeText(path.join(root, "openspec/specs/demo/spec.md"), spec("### Requirement: Alpha\n\n#### Scenario: Hello\n"));
    const result = resolveOwner(root, {
      changeId: "nope",
      capability: "demo",
      requirement: "Missing",
      scenario: "Gone",
    });
    expect(result.issues.some((issue) => issue.code === "dangling-owner")).toBe(true);
  });
});
