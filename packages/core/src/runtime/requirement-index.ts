import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { FieldRequirementPresentation, FieldRequirementStatus } from "../model/ui.js";
import type { ModelPath, SchemaPath } from "../path/index.js";

export type RequirementKind = FieldRequirementStatus | "none";

export interface FieldRequirementSource {
  readonly kind: RequirementKind;
  readonly activationSources: readonly SchemaPath[];
  readonly presentation: FieldRequirementPresentation | undefined;
}

export function buildFieldRequirementIndex(
  model: CompiledFormModel,
): ReadonlyMap<ModelPath, FieldRequirementSource> {
  const index = new Map<ModelPath, FieldRequirementSource>();
  for (const [path, field] of model.ui.fields) {
    const presentation = field.requirement;
    if (presentation === undefined) {
      index.set(path, { kind: "none", activationSources: Object.freeze([]), presentation: undefined });
      continue;
    }
    index.set(path, {
      kind: presentation.status,
      activationSources: Object.freeze([...(presentation.activationSources ?? [])]),
      presentation,
    });
  }
  return index;
}

export function requirementSourceOf(
  index: ReadonlyMap<ModelPath, FieldRequirementSource>,
  path: ModelPath,
): FieldRequirementSource {
  return index.get(path) ?? { kind: "none", activationSources: Object.freeze([]), presentation: undefined };
}
