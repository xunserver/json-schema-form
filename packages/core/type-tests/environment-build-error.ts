import type { EnvironmentBuildError } from "../src/extension/environment-build-error.js";
import type { FormEnvironment } from "../src/extension/environment.js";

declare const error: EnvironmentBuildError;

void error.diagnostics;
void error.message;

type ErrorKeys = keyof EnvironmentBuildError;
type Forbidden = Extract<ErrorKeys, "environment" | "partial" | "builder">;
type AssertNoPartial = Forbidden extends never ? true : never;
const noPartial: AssertNoPartial = true;
void noPartial;

type DiagnosticsAreReadonly = EnvironmentBuildError["diagnostics"] extends readonly unknown[]
  ? true
  : never;
const diagnosticsReadonly: DiagnosticsAreReadonly = true;
void diagnosticsReadonly;

// @ts-expect-error EnvironmentBuildError does not expose a partial environment
const leaked: FormEnvironment | undefined = error.environment;
void leaked;

// @ts-expect-error diagnostics cannot be replaced
error.diagnostics = [];

// @ts-expect-error diagnostics cannot be mutated in place
error.diagnostics.push({
  code: "plugin.duplicate-id",
  severity: "error",
  message: "no",
  source: "plugin",
});

const metadata = error.diagnostics[0]?.metadata;
if (metadata) {
  // @ts-expect-error diagnostic metadata entries are readonly
  metadata.pluginId = "mutated";
}
