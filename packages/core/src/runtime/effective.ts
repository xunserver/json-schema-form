import type { EffectiveState } from "./contracts.js";

export interface EffectiveInputs {
  readonly parent: EffectiveState | undefined;
  readonly schemaActive: boolean;
  readonly uiVisible: boolean;
  readonly uiDisabled: boolean;
  readonly uiReadonly: boolean;
  readonly ruleActive: boolean;
  readonly ruleVisible: boolean;
  readonly ruleDisabled: boolean;
  readonly ruleReadonly: boolean;
  readonly computedTarget: boolean;
  readonly isRoot: boolean;
}

export function combineEffectiveState(input: EffectiveInputs): EffectiveState {
  const parentActive = input.parent?.active ?? true;
  const parentVisible = input.parent?.visible ?? true;
  const parentDisabled = input.parent?.disabled ?? false;
  const parentReadonly = input.parent?.readonly ?? false;
  const active = input.isRoot
    ? true
    : parentActive && input.schemaActive && input.ruleActive;
  const visible = active && parentVisible && input.uiVisible && input.ruleVisible;
  const disabled = parentDisabled || input.uiDisabled || input.ruleDisabled;
  const readonly =
    parentReadonly || input.uiReadonly || input.computedTarget || input.ruleReadonly;
  return { active, visible, disabled, readonly };
}

export const DEFAULT_EFFECTIVE: EffectiveState = Object.freeze({
  active: true,
  visible: true,
  disabled: false,
  readonly: false,
});
