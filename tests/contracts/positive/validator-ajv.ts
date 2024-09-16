import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";
import type { SchemaAdapterDefinition } from "@xunserver-jsf/core/extension";

export const adapter: SchemaAdapterDefinition = createAjvValidator();
export const key: string = AJV_VALIDATOR_KEY;

void adapter.validateAll;
void adapter.kind;
void adapter.name;
