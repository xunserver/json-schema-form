export type ValidationTrigger = "change" | "blur" | "submit" | "manual";

export interface FormConfig {
  readonly validateOn?: ValidationTrigger;
  readonly serializeInactive?: boolean;
}
