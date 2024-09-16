/**
 * shadcn UI Adapter。无默认单例，必须注入宿主组件。
 *
 * @module @xunserver-jsf/shadcn
 */
export {
  SHADCN_ADAPTER_ID,
  createShadcnAdapter,
  extendShadcnAdapter,
  ShadcnAdapterConfigurationError,
} from "./create-shadcn-adapter.js";
export { PROTECTED_NATIVE_KEYS, SHADCN_NAMESPACE } from "./widgets/mapper.js";
export {
  REQUIRED_SHADCN_SLOTS,
  type ShadcnAdapterComponents,
  type RequiredShadcnSlot,
  type ShadcnInputProps,
  type ShadcnTextareaProps,
  type ShadcnCheckboxProps,
  type ShadcnSwitchProps,
  type ShadcnButtonProps,
  type ShadcnSelectRootProps,
  type ShadcnSelectTriggerProps,
  type ShadcnSelectContentProps,
  type ShadcnSelectItemProps,
  type ShadcnSelectGroupProps,
  type ShadcnSelectValueProps,
  type ShadcnComboboxProps,
  type ShadcnComboboxOption,
  type ShadcnFieldProps,
  type ShadcnFieldLabelProps,
  type ShadcnFieldDescriptionProps,
  type ShadcnFieldErrorProps,
  type ShadcnFieldGroupProps,
  type ShadcnCollapsibleProps,
} from "./components.js";
