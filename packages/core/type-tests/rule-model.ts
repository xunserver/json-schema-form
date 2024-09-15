import type { CompiledFormModel, CompiledRule, ModelPath, RuleModel, SchemaDynamics, SerializationPlan } from "../src/index.js";
import type { EffectiveState, FormInstance, SerializeOptions } from "../src/index.js";

declare const model: CompiledFormModel;
declare const form: FormInstance;

const rule: RuleModel = model.rule;
const dynamics: SchemaDynamics = model.schemaDynamics;
const plan: SerializationPlan = rule.serialization;
const compiled: CompiledRule | undefined = rule.rules[0];
void rule.computedOrder;
void dynamics.plans;
void plan.serializeInactive;
void compiled?.functionKeys;

type RuleKeys = keyof CompiledRule;
type ForbiddenRule = Extract<RuleKeys, "evaluate" | "environment" | "callable" | "values">;
type AssertNoRuntime = ForbiddenRule extends never ? true : never;
const noRuntime: AssertNoRuntime = true;
void noRuntime;

type DynamicsKeys = keyof SchemaDynamics;
type ForbiddenDynamics = Extract<DynamicsKeys, "active" | "values" | "store">;
type AssertNoActive = ForbiddenDynamics extends never ? true : never;
const noActive: AssertNoActive = true;
void noActive;

const effective: EffectiveState = {
  active: true,
  visible: true,
  disabled: false,
  readonly: false,
};
void effective;

const options: SerializeOptions = { includeInactive: true, serializer: "company.payload" };
const serialized = form.serialize(options);
void serialized;

// @ts-expect-error serialize options are readonly
options.includeInactive = false;

const leaked: CompiledRule = {
  id: "rule",
  kind: "state",
  target: "" as ModelPath,
  dependencies: [],
  functionKeys: [],
  action: { kind: "state", aspects: {} },
  // @ts-expect-error CompiledRule cannot carry a callable provider
  evaluate: () => true,
};
void leaked;
