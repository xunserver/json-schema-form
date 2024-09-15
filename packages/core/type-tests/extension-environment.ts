import type { FormEnvironment } from "../src/extension/environment.js";
import type { Registry } from "../src/extension/registry.js";
import type { WidgetDefinition } from "../src/widget/widget.js";

declare const registry: Registry<WidgetDefinition>;
declare const environment: FormEnvironment;

void registry.size;
void environment.pluginIds;

type RegistryKeys = keyof Registry<WidgetDefinition>;
type MutationKeys = Extract<RegistryKeys, "set" | "delete" | "clear">;
type AssertNoMutation = MutationKeys extends never ? true : never;
const noMutation: AssertNoMutation = true;
void noMutation;

type EnvironmentKeys = keyof FormEnvironment;
type ForbiddenEnvironmentKeys = Extract<
  EnvironmentKeys,
  | "builder"
  | "set"
  | "transactionManager"
  | "compilerContext"
  | "effectScheduler"
  | "runtimeNodeId"
  | "RuntimeNodeId"
>;
type AssertNoInternals = ForbiddenEnvironmentKeys extends never ? true : never;
const noInternals: AssertNoInternals = true;
void noInternals;

// @ts-expect-error Registry facade has no set
registry.set("text", registry.get("text")!);

// @ts-expect-error Registry facade has no delete
registry.delete("text");

// @ts-expect-error Registry facade has no clear
registry.clear();

// @ts-expect-error Environment plugin order is readonly
environment.pluginIds = [];

// @ts-expect-error Environment does not expose a builder
environment.builder;

// @ts-expect-error Environment does not expose a transaction manager
environment.transactionManager;

declare const inspect: FormEnvironment["inspect"];
const inspection = inspect("widgets", "text");
if (inspection) {
  // @ts-expect-error provenance inspection is readonly
  inspection.pluginId = "other";
}
