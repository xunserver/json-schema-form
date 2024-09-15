import type {
  SchemaDialectDefinition,
  SchemaExtensionDefinition,
  ValueInitializerDefinition,
} from "../src/extension/contributions.js";
import type { JsonValue } from "../src/definition/json-value.js";
import type { CompiledFormModel } from "../src/model/compiled-form-model.js";

const dialect: SchemaDialectDefinition = {
  name: "draft-07",
  dialects: ["http://json-schema.org/draft-07/schema#"],
  convert: (schema) => ({ schema }),
};
void dialect;

const extension: SchemaExtensionDefinition = {
  name: "x-ui",
  keyword: "x-ui",
  split: ({ value, schemaPath, modelPath }) => {
    void value;
    void schemaPath;
    void modelPath;
    return {};
  },
};
void extension;

const initializer: ValueInitializerDefinition = {
  name: "company.defaults",
  initialize: ({ initialValues, model }) => {
    void model;
    return initialValues ?? {};
  },
};
void initializer;

type DialectKeys = keyof SchemaDialectDefinition;
type ForbiddenDialect = Extract<DialectKeys, "form" | "store" | "command" | "fetch" | "then" | "transaction">;
type AssertNoDialectContext = ForbiddenDialect extends never ? true : never;
const noDialectContext: AssertNoDialectContext = true;
void noDialectContext;

type ExtensionKeys = keyof SchemaExtensionDefinition;
type ForbiddenExtension = Extract<ExtensionKeys, "form" | "store" | "command" | "fetch" | "then" | "transaction">;
type AssertNoExtensionContext = ForbiddenExtension extends never ? true : never;
const noExtensionContext: AssertNoExtensionContext = true;
void noExtensionContext;

type InitializerKeys = keyof ValueInitializerDefinition;
type ForbiddenInitializer = Extract<
  InitializerKeys,
  "form" | "store" | "command" | "fetch" | "then" | "transaction"
>;
type AssertNoInitializerContext = ForbiddenInitializer extends never ? true : never;
const noInitializerContext: AssertNoInitializerContext = true;
void noInitializerContext;

const rejectedAsyncDialect: SchemaDialectDefinition = {
  name: "async",
  dialects: ["http://json-schema.org/draft-07/schema#"],
  // @ts-expect-error convert cannot be async
  convert: async (schema) => ({ schema }),
};
void rejectedAsyncDialect;

const rejectedAsyncExtension: SchemaExtensionDefinition = {
  name: "x-ui",
  keyword: "x-ui",
  // @ts-expect-error split cannot be async
  split: async () => ({}),
};
void rejectedAsyncExtension;

const rejectedAsyncInitializer: ValueInitializerDefinition = {
  name: "company.defaults",
  // @ts-expect-error initialize cannot be async
  initialize: async ({ initialValues }) => initialValues ?? {},
};
void rejectedAsyncInitializer;

const rejectedFormContext: ValueInitializerDefinition = {
  name: "company.defaults",
  initialize: ({ initialValues, model }): JsonValue => {
    void model;
    return initialValues ?? null;
  },
  // @ts-expect-error provider has no FormInstance context
  form: {},
};
void rejectedFormContext;

const rejectedStoreContext: SchemaDialectDefinition = {
  name: "draft-07",
  dialects: ["http://json-schema.org/draft-07/schema#"],
  convert: (schema) => ({ schema }),
  // @ts-expect-error provider has no Store writer
  store: {},
};
void rejectedStoreContext;

const rejectedTransactionContext: SchemaExtensionDefinition = {
  name: "x-ui",
  keyword: "x-ui",
  split: () => ({}),
  // @ts-expect-error provider has no Transaction capability
  transaction: {},
};
void rejectedTransactionContext;

declare const compiled: CompiledFormModel;
void compiled;
