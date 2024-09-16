import type { WidgetRenderInput, SemanticActions } from "../src/index.js";
import type { RenderScope } from "@xunserver-jsf/core/runtime";

type InputKeys = keyof WidgetRenderInput;
type ForbiddenInput = Extract<
  InputKeys,
  "form" | "store" | "FormInstance" | "nativeEvent" | "event" | "writer" | "validation" | "TransactionManager"
>;
type AssertNoForbidden = ForbiddenInput extends never ? true : never;
const noForbidden: AssertNoForbidden = true;
void noForbidden;

type ActionKeys = keyof SemanticActions;
type ForbiddenActions = Extract<ActionKeys, "submit" | "validate" | "applyErrors" | "setValues">;
type AssertSemanticOnly = ForbiddenActions extends never ? true : never;
const semanticOnly: AssertSemanticOnly = true;
void semanticOnly;

type ScopeWriter = Extract<keyof RenderScope, "setValue" | "touch" | "array">;
type AssertReadonlyScope = ScopeWriter extends never ? true : never;
const readonlyScope: AssertReadonlyScope = true;
void readonlyScope;
