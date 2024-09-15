import type {
  ApplyErrorsOptions,
  ServerErrorInput,
  SubmitResult,
  ValidationError,
  ValidationResult,
} from "../src/index.js";
import type { JsonValue } from "../src/definition/json-value.js";

declare const error: ValidationError;
declare const result: ValidationResult;
declare const submit: SubmitResult;
declare const input: ServerErrorInput;
declare const options: ApplyErrorsOptions;

const source: ValidationError["source"] = error.source;
const schema: "schema" = "schema";
const custom: "custom" = "custom";
const asyncSource: "async" = "async";
const server: "server" = "server";
void source;
void schema;
void custom;
void asyncSource;
void server;

const params: JsonValue | undefined = error.params;
void params;
void result.version;
void result.valid;
void result.errors;
void result.superseded;
void submit.submitted;
void submit.payload;
void input.code;
void options.preserveOnChange;

// @ts-expect-error ValidationError id is readonly
error.id = "mutated";
// @ts-expect-error ValidationError source is readonly
error.source = "server";
// @ts-expect-error ValidationError params are readonly
error.params = { x: 1 };
// @ts-expect-error ValidationResult errors are readonly
result.errors = [];
// @ts-expect-error ValidationResult valid is readonly
result.valid = true;
// @ts-expect-error SubmitResult payload is readonly
submit.payload = {};
// @ts-expect-error ServerErrorInput code is readonly
input.code = "other";

if (typeof error.params === "object" && error.params !== null && !Array.isArray(error.params)) {
  // @ts-expect-error nested params cannot be mutated
  error.params.nested = true;
}

type ErrorKeys = keyof ValidationError;
type RequiredErrorKeys = "id" | "code" | "source" | "instancePath";
type AssertRequired = RequiredErrorKeys extends ErrorKeys ? true : never;
const requiredKeys: AssertRequired = true;
void requiredKeys;
