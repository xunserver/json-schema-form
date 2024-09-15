import { defineWidget } from "../src/widget/define-widget.js";
import type { WidgetDefinition, WidgetInteractionContract } from "../src/widget/widget.js";

const authored = defineWidget({
  name: "sku",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true, blur: true },
});

type AuthoredName = typeof authored.name;
const nameLiteral: AuthoredName = "sku";
void nameLiteral;

type AuthoredSetValue = typeof authored.interaction.setValue;
const setValueLiteral: AuthoredSetValue = true;
void setValueLiteral;

type AuthoredBlur = typeof authored.interaction.blur;
const blurLiteral: AuthoredBlur = true;
void blurLiteral;

defineWidget({
  name: "bad.component",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true },
  // @ts-expect-error defineWidget does not accept framework component slots
  component: {},
});

defineWidget({
  name: "bad.handler",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true },
  // @ts-expect-error defineWidget does not accept Runtime handlers
  onChange: () => undefined,
});

const interaction: WidgetInteractionContract = { setValue: true, touch: true, focus: true, blur: true };
void interaction;

const rejectedFalseSetValue: WidgetInteractionContract = {
  // @ts-expect-error setValue must be the literal true
  setValue: false,
};
void rejectedFalseSetValue;

const rejectedUnknownAction: WidgetInteractionContract = {
  setValue: true,
  // @ts-expect-error unknown semantic actions are not part of the contract
  submit: true,
};
void rejectedUnknownAction;

type InteractionKeys = keyof WidgetInteractionContract;
type ForbiddenInteraction = Extract<InteractionKeys, "onChange" | "onBlur" | "nativeEvent" | "form" | "store">;
type AssertNoHostInteraction = ForbiddenInteraction extends never ? true : never;
const noHostInteraction: AssertNoHostInteraction = true;
void noHostInteraction;

type WidgetKeys = keyof WidgetDefinition;
type AssertHasInteraction = "interaction" extends WidgetKeys ? true : never;
const hasInteraction: AssertHasInteraction = true;
void hasInteraction;
