import type { InstancePath } from "../path/types.js";
import type { ArrayItemId, ViewNodeId } from "../identity/index.js";
import type { JsonValue } from "./contracts.js";
import type { RuntimeCommand } from "./commands.js";

export const PHASE_ORDER = Object.freeze([
  "activation",
  "rule",
  "syncValidation",
  "commit",
  "asyncSchedule",
] as const);

export type PhaseName = (typeof PHASE_ORDER)[number];

export interface BlurredChange {
  readonly viewId: ViewNodeId;
  readonly path: InstancePath;
  readonly itemChain: readonly ArrayItemId[];
}

export interface NormalizedChangeSet {
  readonly valuePaths: readonly InstancePath[];
  readonly fieldPaths: readonly InstancePath[];
  readonly viewIds: readonly ViewNodeId[];
  readonly blurred: readonly BlurredChange[];
  readonly reset: boolean;
}

export interface TransactionPhaseContext {
  readonly phase: "activation" | "rule" | "syncValidation" | "asyncSchedule";
  readonly committedVersion: number;
  readonly changeSet: NormalizedChangeSet;
  getValue(path: InstancePath | string): JsonValue | undefined;
  enqueue(command: RuntimeCommand): void;
}

export interface PhaseSet {
  readonly activation: (context: TransactionPhaseContext) => void;
  readonly rule: (context: TransactionPhaseContext) => void;
  readonly syncValidation: (context: TransactionPhaseContext) => void;
  readonly asyncSchedule: (context: TransactionPhaseContext) => void;
}

export const RUNTIME_COMMAND_LIMIT = 64;
export const RUNTIME_ITERATION_LIMIT = 32;

export function createNoopPhaseSet(): PhaseSet {
  const noop = (): void => {};
  return Object.freeze({
    activation: noop,
    rule: noop,
    syncValidation: noop,
    asyncSchedule: noop,
  });
}

export function freezePhaseSet(overrides?: Partial<PhaseSet>): PhaseSet {
  const defaults = createNoopPhaseSet();
  return Object.freeze({
    activation: overrides?.activation ?? defaults.activation,
    rule: overrides?.rule ?? defaults.rule,
    syncValidation: overrides?.syncValidation ?? defaults.syncValidation,
    asyncSchedule: overrides?.asyncSchedule ?? defaults.asyncSchedule,
  });
}
