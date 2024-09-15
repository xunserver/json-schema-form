import type { FormEnvironment } from "../../extension/environment.js";
import type { WidgetDefinition, WidgetMatcher } from "../../widget/widget.js";
import { inspectWidgetInteraction } from "../../widget/widget.js";
import type { FieldUI } from "../../definition/ui-schema.js";
import type { DataNode } from "../../model/data/data.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import type { ModelPath } from "../../model/path/index.js";
import { DiagnosticBag, compilerError, compilerWarning } from "../diagnostics.js";

const CATEGORY_RANK = {
  "enum-const": 0,
  format: 1,
  "type-shape": 2,
  fallback: 3,
} as const;

type MatcherCategory = keyof typeof CATEGORY_RANK;

export interface ResolvedWidget {
  readonly name: string;
  readonly definition: WidgetDefinition;
}

export function resolveWidget(
  node: DataNode,
  fieldUI: FieldUI | undefined,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
  path: ModelPath,
): ResolvedWidget | undefined {
  if (fieldUI?.widget !== undefined) {
    const definition = environment.widgets.get(fieldUI.widget);
    if (definition === undefined) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.WIDGET_MISSING, `Widget "${fieldUI.widget}" is not registered`, {
          modelPath: path,
          metadata: { widget: fieldUI.widget },
        }),
      );
      return undefined;
    }
    if (!isCompatible(node, fieldUI, definition, diagnostics, path)) {
      return undefined;
    }
    return { name: fieldUI.widget, definition };
  }

  const matches = collectMatches(node, environment);
  if (matches.length === 0) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.WIDGET_MISSING, "No compatible widget matcher was found", {
        modelPath: path,
        metadata: { kind: node.kind },
      }),
    );
    return undefined;
  }

  matches.sort((left, right) => {
    if (left.category !== right.category) {
      return CATEGORY_RANK[left.category] - CATEGORY_RANK[right.category];
    }
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    return left.order - right.order;
  });

  const winner = matches[0]!;
  const tied = matches.filter(
    (match) =>
      match.category === winner.category && match.priority === winner.priority && match.name !== winner.name,
  );
  if (tied.length > 0) {
    diagnostics.push(
      compilerWarning(
        COMPILER_DIAGNOSTIC_CODES.WIDGET_AMBIGUOUS,
        `Multiple widgets matched at the same rank; using "${winner.name}"`,
        {
          modelPath: path,
          metadata: { widget: winner.name, tied: tied.map((item) => item.name) },
        },
      ),
    );
  }

  if (!isCompatible(node, fieldUI, winner.definition, diagnostics, path)) {
    return undefined;
  }
  return { name: winner.name, definition: winner.definition };
}

interface RankedMatch {
  readonly name: string;
  readonly definition: WidgetDefinition;
  readonly category: MatcherCategory;
  readonly priority: number;
  readonly order: number;
}

function collectMatches(node: DataNode, environment: FormEnvironment): RankedMatch[] {
  const matches: RankedMatch[] = [];
  let order = 0;
  for (const entry of environment.widgets.inspectAll()) {
    const definition = entry.value;
    for (const matcher of definition.matchers ?? []) {
      const category = categoryOf(matcher);
      if (matcherFits(node, matcher, category)) {
        matches.push({
          name: entry.key,
          definition,
          category,
          priority: matcher.priority ?? 0,
          order,
        });
      }
    }
    if ((definition.matchers === undefined || definition.matchers.length === 0) && node.kind === "scalar") {
      matches.push({
        name: entry.key,
        definition,
        category: "fallback",
        priority: 0,
        order,
      });
    }
    order += 1;
  }
  return matches;
}

function categoryOf(matcher: WidgetMatcher): MatcherCategory {
  if (matcher.enum === true || matcher.const === true) {
    return "enum-const";
  }
  if (matcher.formats !== undefined && matcher.formats.length > 0) {
    return "format";
  }
  if (matcher.schemaTypes !== undefined && matcher.schemaTypes.length > 0) {
    return "type-shape";
  }
  return "fallback";
}

function matcherFits(node: DataNode, matcher: WidgetMatcher, category: MatcherCategory): boolean {
  if (category === "enum-const") {
    if (node.kind !== "scalar") {
      return false;
    }
    if (matcher.enum === true && node.enum !== undefined) {
      return true;
    }
    if (matcher.const === true && node.const !== undefined) {
      return true;
    }
    return false;
  }
  if (category === "format") {
    return node.kind === "scalar" && node.format !== undefined && (matcher.formats ?? []).includes(node.format);
  }
  if (category === "type-shape") {
    const types = matcher.schemaTypes ?? [];
    return jsonTypesOf(node).some((type) => types.includes(type));
  }
  return true;
}

function jsonTypesOf(node: DataNode): readonly string[] {
  if (node.kind === "scalar") {
    const types = [node.valueType];
    if (node.nullable && node.valueType !== "null") {
      return [...types, "null"];
    }
    return types;
  }
  if (node.kind === "object") {
    return ["object"];
  }
  if (node.kind === "array") {
    return ["array"];
  }
  if (node.kind === "union") {
    return unique(node.variants.flatMap(jsonTypesOf));
  }
  if (node.kind === "any") {
    return ["string", "number", "integer", "boolean", "object", "array", "null"];
  }
  return [];
}

function isCompatible(
  node: DataNode,
  fieldUI: FieldUI | undefined,
  definition: WidgetDefinition,
  diagnostics: DiagnosticBag,
  path: ModelPath,
): boolean {
  const jsonTypes = definition.valueContract.jsonTypes;
  const nodeTypes = jsonTypesOf(node).filter((type) => type !== "null");
  const typeOk =
    node.kind === "any" ||
    nodeTypes.length === 0 ||
    nodeTypes.every(
      (type) => (jsonTypes as readonly string[]).includes(type) || compatibleNumeric(type, jsonTypes),
    );

  if (!typeOk) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE,
        `Widget "${definition.name}" is incompatible with the data shape`,
        {
          modelPath: path,
          metadata: { widget: definition.name, jsonTypes, nodeKind: node.kind },
        },
      ),
    );
    return false;
  }

  const props = fieldUI?.props;
  const contract = definition.propsContract?.properties;
  if (props !== undefined && contract !== undefined) {
    for (const key of Object.keys(props)) {
      if (key === "required") {
        continue;
      }
      const expected = contract[key];
      if (expected === undefined) {
        diagnostics.push(
          compilerError(
            COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE,
            `Widget "${definition.name}" does not declare prop "${key}"`,
            { modelPath: path, metadata: { widget: definition.name, prop: key } },
          ),
        );
        return false;
      }
      if (expected.type !== undefined && !matchesPropType(props[key], expected.type)) {
        diagnostics.push(
          compilerError(
            COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE,
            `Widget prop "${key}" does not match the declared type`,
            { modelPath: path, metadata: { widget: definition.name, prop: key } },
          ),
        );
        return false;
      }
    }
  }

  const behavior = fieldUI?.behavior;
  if (behavior?.disabled === true && definition.capabilities?.disabled !== true) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE,
        `Widget "${definition.name}" does not support disabled behavior`,
        { modelPath: path, metadata: { widget: definition.name, capability: "disabled" } },
      ),
    );
    return false;
  }
  if (behavior?.readonly === true && definition.capabilities?.readonly !== true) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE,
        `Widget "${definition.name}" does not support readonly behavior`,
        { modelPath: path, metadata: { widget: definition.name, capability: "readonly" } },
      ),
    );
    return false;
  }

  const interaction = inspectWidgetInteraction(definition.interaction);
  if (!interaction.ok) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE,
        `Widget "${definition.name}" has an invalid interaction contract`,
        {
          modelPath: path,
          metadata: {
            widget: definition.name,
            reason: interaction.reason,
            ...(interaction.action === undefined ? {} : { action: interaction.action }),
          },
        },
      ),
    );
    return false;
  }

  return true;
}

function compatibleNumeric(type: string, jsonTypes: readonly string[]): boolean {
  return (
    (type === "integer" && jsonTypes.includes("number")) ||
    (type === "number" && jsonTypes.includes("integer"))
  );
}

function matchesPropType(value: unknown, type: string): boolean {
  if (type === "string") {
    return typeof value === "string";
  }
  if (type === "number") {
    return typeof value === "number";
  }
  if (type === "boolean") {
    return typeof value === "boolean";
  }
  return true;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
