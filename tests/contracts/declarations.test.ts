import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";

const PUBLIC_ROOT_CONTRACTS = [
  "SchemaPath",
  "ModelPath",
  "InstancePath",
  "DataNodeId",
  "ViewNodeId",
  "ArrayItemId",
  "Diagnostic",
  "FormDefinition",
  "defineForm",
  "compileForm",
  "createForm",
  "createFormEngine",
  "FormInstance",
  "FieldInstance",
  "FormRuntimeError",
  "CompileOptions",
  "CompiledFormModel",
  "CompileResult",
  "CompileError",
];

const PRIVATE_SYMBOLS = [
  "RuntimeNodeId",
  "TransactionManager",
  "CompilerContext",
  "EffectScheduler",
  "ValueStoreImpl",
  "ChangeQueue",
  "EnvironmentIdentity",
];

describe("generated Core public surface", () => {
  test("root declarations expose application contracts only", () => {
    const declaration = fs.readFileSync(path.join(REPO_ROOT, "packages/core/dist/index.d.ts"), "utf8");

    for (const name of PUBLIC_ROOT_CONTRACTS) {
      expect(declaration, `missing ${name}`).toContain(name);
    }

    for (const name of PRIVATE_SYMBOLS) {
      expect(declaration, `leaked ${name}`).not.toContain(name);
    }
  });

  test("runtime entry exposes advanced selector contracts without internals", () => {
    const runtime = fs.readFileSync(path.join(REPO_ROOT, "packages/core/dist/runtime/index.d.ts"), "utf8");

    for (const name of [
      "valueSelector",
      "fieldSelector",
      "viewSelector",
      "formSelector",
      "createSelector",
      "getRuntimeSnapshot",
      "subscribeRuntime",
      "observeRuntimeDiagnostics",
      "RuntimeSelector",
    ]) {
      expect(runtime, `missing ${name}`).toContain(name);
    }

    for (const name of PRIVATE_SYMBOLS) {
      expect(runtime, `leaked ${name}`).not.toContain(name);
    }
  });

  test("extension entry exposes frozen plugin contracts without internals", () => {
    const extension = fs.readFileSync(
      path.join(REPO_ROOT, "packages/core/dist/extension/index.d.ts"),
      "utf8",
    );

    for (const name of [
      "definePlugin",
      "createFormEnvironment",
      "EnvironmentBuildError",
      "CORE_EXTENSION_PROTOCOL",
      "FormPlugin",
      "FormEnvironment",
      "WidgetDefinition",
      "Registry",
    ]) {
      expect(extension, `missing ${name}`).toContain(name);
    }

    for (const name of ["RuntimeNodeId", "TransactionManager", "CompilerContext", "EffectScheduler", "ValueStoreImpl", "ChangeQueue"]) {
      expect(extension, `leaked ${name}`).not.toContain(name);
    }

    expect(extension).not.toMatch(/\bMap\b/);
    expect(extension).not.toContain("builder");
  });
});
