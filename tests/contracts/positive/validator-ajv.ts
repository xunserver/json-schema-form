import { AJV_VALIDATOR_KEY, createAjvValidator } from "@form/validator-ajv";
import type { SchemaAdapterDefinition } from "@form/core/extension";

export const adapter: SchemaAdapterDefinition = createAjvValidator();
export const key: string = AJV_VALIDATOR_KEY;

void adapter.validateAll;
void adapter.kind;
void adapter.name;
