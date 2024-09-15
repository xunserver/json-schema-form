import type { ModelPathLike } from "../model/path/index.js";
import type { JsonValue } from "./json-value.js";

export type ValidationTrigger = "change" | "blur" | "submit" | "manual";

export type ErrorPresentationPolicy =
  | "always"
  | "touched"
  | "submitted"
  | "touched-or-submitted"
  | "never";

export interface ValidatorUse {
  readonly validator: string;
  readonly target: ModelPathLike;
  readonly dependencies: readonly ModelPathLike[];
  readonly trigger?: ValidationTrigger | readonly ValidationTrigger[];
  readonly options?: JsonValue;
}

export interface FormConfig {
  readonly validateOn?: ValidationTrigger;
  readonly schemaValidator?: string;
  readonly validators?: readonly ValidatorUse[];
  readonly errorPresentation?: ErrorPresentationPolicy;
  readonly preserveServerErrorsOnChange?: boolean;
  readonly serializeInactive?: boolean;
  readonly serializer?: string;
  readonly valueInitializer?: string;
}
