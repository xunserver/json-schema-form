import { defineValidator } from "../src/extension/define-validator.js";
import type {
  AsyncValidatorDefinition,
  SchemaAdapterDefinition,
  SyncValidatorDefinition,
  ValidatorDefinition,
} from "../src/extension/contributions.js";
import type { CustomValidatorContext } from "../src/extension/contributions.js";

const sync = defineValidator({
  name: "company.format-email",
  kind: "sync",
  validate: (context) => {
    void context.target;
    void context.dependencies;
    void context.options;
    void context.path;
    return [];
  },
});
void sync;

const asyncValidator = defineValidator({
  name: "company.unique-email",
  kind: "async",
  validate: async (context, signal) => {
    void context.modelPath;
    void signal?.aborted;
    return [];
  },
});
void asyncValidator;

const adapter = defineValidator({
  name: "ajv-2020",
  kind: "schema-adapter",
  capabilities: { validateAffected: true },
  validateAll: () => [],
  validateAffected: () => [],
});
void adapter;

type SyncKeys = keyof SyncValidatorDefinition;
type ForbiddenSync = Extract<SyncKeys, "form" | "store" | "transaction" | "command" | "fetch">;
type AssertNoSyncRuntime = ForbiddenSync extends never ? true : never;
const noSyncRuntime: AssertNoSyncRuntime = true;
void noSyncRuntime;

type ContextKeys = keyof CustomValidatorContext;
type ForbiddenContext = Extract<ContextKeys, "form" | "store" | "transaction" | "runtimeNodeId">;
type AssertNoContextEscape = ForbiddenContext extends never ? true : never;
const noContextEscape: AssertNoContextEscape = true;
void noContextEscape;

defineValidator({
  name: "company.bad-sync",
  kind: "sync",
  // @ts-expect-error sync provider cannot return a Promise
  validate: async () => [],
});

const rejectedStore: SyncValidatorDefinition = {
  name: "company.store",
  kind: "sync",
  validate: () => [],
  // @ts-expect-error provider cannot take a Store
  store: {},
};
void rejectedStore;

const rejectedForm: AsyncValidatorDefinition = {
  name: "company.form",
  kind: "async",
  validate: async () => [],
  // @ts-expect-error provider cannot take a FormInstance
  form: {},
};
void rejectedForm;

const rejectedTransaction: SchemaAdapterDefinition = {
  name: "company.tx",
  kind: "schema-adapter",
  validateAll: () => [],
  // @ts-expect-error adapter cannot take a transaction
  transaction: {},
};
void rejectedTransaction;

defineValidator({
  name: "bad.ajv",
  kind: "schema-adapter",
  validateAll: () => [],
  // @ts-expect-error Core adapter contract has no AJV instance
  ajv: {},
});

const union: ValidatorDefinition = sync;
void union;
