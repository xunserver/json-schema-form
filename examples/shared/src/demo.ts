import { compileForm, createForm, defineForm } from "@form/core";
import { createDemoEnvironment } from "./environment.js";
import { getDefaultCatalogExample } from "./catalog.js";
import type { CatalogExample } from "./types.js";

export function catalogExampleToDefinition(example: CatalogExample) {
  return defineForm({
    schema: example.schema as never,
    ...(example.uiSchema !== undefined ? { uiSchema: example.uiSchema as never } : {}),
    ...(example.rules !== undefined ? { rules: example.rules as never } : {}),
    ...(example.config !== undefined ? { config: example.config as never } : {}),
  });
}

/** Smoke / integration demo aligned with the kitchen-sink catalog entry. */
export const demoDefinition = catalogExampleToDefinition(getDefaultCatalogExample());

export function createDemoForm() {
  const environment = createDemoEnvironment();
  const example = getDefaultCatalogExample();
  const { model } = compileForm(demoDefinition, { environment });
  return createForm(model, {
    environment,
    initialValues: (example.formData ?? {}) as never,
  });
}
