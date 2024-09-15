import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";
import { formatDiagnostics, loadTsconfig, typecheckFiles, typecheckProject } from "../lib/typecheck.js";

const consumerOptions = loadTsconfig(
  path.join(REPO_ROOT, "tests/contracts/positive/tsconfig.json"),
).options;

describe("consumer export isolation", () => {
  test("resolves root contracts and supported subpaths without path aliases", () => {
    const diagnostics = typecheckProject(
      path.join(REPO_ROOT, "tests/contracts/positive/tsconfig.json"),
    );
    expect(formatDiagnostics(diagnostics), formatDiagnostics(diagnostics)).toBe("");
  });

  test("rejects an undeclared compiler deep import", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/compiler-deep-import.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(/Cannot find module '@form\/core\/src\/compiler\/compile-form\.js'/);
  });

  test("rejects Advanced Runtime factories from the public root", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/runtime-from-root.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(
      /has no exported member 'valueSelector'|has no exported member 'subscribeRuntime'|has no exported member 'getRenderScope'|has no exported member 'InstanceBinding'|has no exported member 'RenderScope'/,
    );
  });

  test("rejects an undeclared runtime deep import", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/runtime-deep-import.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(
      /Cannot find module '@form\/core\/src\/runtime\/form-runtime\.js'/,
    );
  });
  test("rejects contribution contracts from the runtime entry", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/runtime-contributions.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(
      /has no exported member 'SchemaDialectDefinition'|has no exported member 'SchemaExtensionDefinition'|has no exported member 'ValueInitializerDefinition'/,
    );
  });

  test("rejects Extension-only symbols from the public root", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/extension-from-root.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(
      /has no exported member 'definePlugin'|has no exported member 'defineWidget'|has no exported member 'createFormEnvironment'|has no exported member 'defineValidator'|has no exported member 'SchemaDialectDefinition'|has no exported member 'SchemaExtensionDefinition'|has no exported member 'ValueInitializerDefinition'/,
    );
  });

  test("rejects private symbols from the public root", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/private-symbol.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(/has no exported member 'RuntimeNodeId'|has no exported member 'TransactionManager'|has no exported member 'RuleDynamicsEngine'/);
  });

  test("rejects validation internals and AJV factory from the public root", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/validation-internals.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(
      /has no exported member 'ValidationEngine'|has no exported member 'ErrorStore'|has no exported member 'createAjvValidator'/,
    );
  });

  test("rejects Path category mismatch", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/path-mismatch.ts")],
      consumerOptions,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2322);
    expect(formatDiagnostics(diagnostics)).toMatch(/ModelPath[\s\S]*InstancePath|not assignable/);
  });

  test("rejects ID category mismatch", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/id-mismatch.ts")],
      consumerOptions,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2322);
    expect(formatDiagnostics(diagnostics)).toMatch(/ViewNodeId[\s\S]*DataNodeId|not assignable/);
  });

  test("rejects readonly model mutation", () => {
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/negative/readonly-mutation.ts")],
      consumerOptions,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    const text = formatDiagnostics(diagnostics);
    expect(text).toMatch(/read-only|readonly/i);
    expect(diagnostics.every((diagnostic) => diagnostic.code === 2540 || diagnostic.code === 2339)).toBe(
      true,
    );
  });
});
