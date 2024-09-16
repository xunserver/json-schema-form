import type { CompiledFormModel } from "../../model/compiled-form-model.js";
import type { CompiledRule } from "../../model/rule/rule.js";
import { bindTemplatePath, modelPathListCount } from "../../model/path/bind-path.js";
import {
  ROOT_INSTANCE_PATH,
  ROOT_MODEL_PATH,
  instancePathStartsWith,
  type InstancePath,
  type ModelPath,
} from "../../model/path/index.js";
import type { TransactionDraft } from "../transaction/commands.js";
import type { RuntimeNodeId } from "../form/runtime-node-id.js";

export interface DependencyScheduleInput {
  readonly draft: TransactionDraft;
  readonly changePaths: readonly InstancePath[];
  /** Schema activation paths that flipped from inactive to active in this transaction. */
  readonly activationFlips: readonly InstancePath[];
  readonly forceAll: boolean;
}

/**
 * Transaction-owned dependency scheduler.
 * Internal only — must not be exported from @xunserver-jsf/core public barrels.
 */
export class DependencyScheduler {
  private readonly rulesById: ReadonlyMap<string, CompiledRule>;

  constructor(private readonly model: CompiledFormModel) {
    this.rulesById = new Map(model.rule.rules.map((rule) => [rule.id, rule]));
  }

  schedule(input: DependencyScheduleInput): Set<string> {
    if (input.forceAll) {
      return this.allInstances(input.draft);
    }
    const scheduled = new Set<string>();
    this.scheduleForPaths(input.draft, input.changePaths, scheduled);
    this.scheduleForActivationFlips(input.draft, input.activationFlips, scheduled);
    this.scheduleInactiveControl(input.draft, scheduled);
    return scheduled;
  }

  collectActivationFlips(
    previous: ReadonlyMap<string, boolean>,
    next: ReadonlyMap<string, boolean>,
  ): InstancePath[] {
    const flips: InstancePath[] = [];
    for (const path of new Set([...previous.keys(), ...next.keys()])) {
      const wasActive = previous.get(path) !== false;
      const isActive = next.get(path) !== false;
      if (!wasActive && isActive) {
        flips.push(path as InstancePath);
      }
    }
    return flips;
  }

  private scheduleForPaths(
    draft: TransactionDraft,
    changePaths: readonly InstancePath[],
    scheduled: Set<string>,
  ): void {
    const modelPaths = new Map<string, ModelPath>();
    for (const path of changePaths) {
      const id = draft.bindings.idAt(path);
      const record = id === undefined ? undefined : draft.bindings.records.get(id);
      if (record !== undefined) {
        modelPaths.set(path, record.modelPath);
      }
    }
    for (const [instancePath, modelPath] of modelPaths) {
      this.addRulesForModelPath(draft, instancePath as InstancePath, modelPath, scheduled);
    }
  }

  private scheduleForActivationFlips(
    draft: TransactionDraft,
    flips: readonly InstancePath[],
    scheduled: Set<string>,
  ): void {
    if (flips.length === 0) {
      return;
    }
    const flipped = new Set(flips);
    for (const record of draft.bindings.records.values()) {
      const path = draft.bindings.pathOf(record.runtimeId);
      if (path === undefined) {
        continue;
      }
      const underFlip =
        flipped.has(path) ||
        flips.some((flip) => flip !== ROOT_INSTANCE_PATH && instancePathStartsWith(path, flip));
      if (!underFlip) {
        continue;
      }
      this.addRulesForModelPath(draft, path, record.modelPath, scheduled);
    }
  }

  private addRulesForModelPath(
    draft: TransactionDraft,
    instancePath: InstancePath,
    modelPath: ModelPath,
    scheduled: Set<string>,
  ): void {
    const ruleIds = new Set<string>(this.model.rule.byPath.get(modelPath) ?? []);
    for (const rule of this.model.rule.rules) {
      if (rule.target === modelPath || isModelDescendant(rule.target, modelPath)) {
        ruleIds.add(rule.id);
      }
    }
    for (const ruleId of ruleIds) {
      const rule = this.rulesById.get(ruleId);
      if (rule === undefined) {
        continue;
      }
      if (modelPathListCount(modelPath) < modelPathListCount(rule.target)) {
        for (const record of draft.bindings.records.values()) {
          if (record.modelPath === rule.target) {
            scheduled.add(instanceKey(rule.id, record.runtimeId));
          }
        }
      } else {
        const targetInstance = bindTemplatePath(rule.target, modelPath, instancePath);
        const targetId = draft.bindings.idAt(targetInstance);
        if (targetId !== undefined) {
          scheduled.add(instanceKey(rule.id, targetId));
        }
      }
    }
  }

  private scheduleInactiveControl(draft: TransactionDraft, scheduled: Set<string>): void {
    for (const rule of this.model.rule.rules) {
      if (rule.kind !== "state" || rule.action.kind !== "state" || rule.action.aspects.active === undefined) {
        continue;
      }
      for (const record of draft.bindings.records.values()) {
        if (record.modelPath === rule.target) {
          scheduled.add(instanceKey(rule.id, record.runtimeId));
        }
      }
    }
  }

  private allInstances(draft: TransactionDraft): Set<string> {
    const scheduled = new Set<string>();
    for (const rule of this.model.rule.rules) {
      const target = rule.target;
      let found = false;
      for (const record of draft.bindings.records.values()) {
        if (record.modelPath === target) {
          scheduled.add(instanceKey(rule.id, record.runtimeId));
          found = true;
        }
      }
      if (!found && (target === ROOT_MODEL_PATH || rule.kind === "effect")) {
        const rootId = draft.bindings.idAt(ROOT_INSTANCE_PATH);
        if (rootId !== undefined) {
          scheduled.add(instanceKey(rule.id, rootId));
        }
      }
    }
    return scheduled;
  }
}

export function instanceKey(ruleId: string, runtimeId: RuntimeNodeId | string): string {
  return `${ruleId}::${String(runtimeId)}`;
}

export function splitInstanceKey(key: string): { ruleId: string; runtimeId: string } {
  const index = key.indexOf("::");
  return { ruleId: key.slice(0, index), runtimeId: key.slice(index + 2) };
}

function isModelDescendant(path: ModelPath, ancestor: ModelPath): boolean {
  if (ancestor === ROOT_MODEL_PATH) {
    return false;
  }
  return path.startsWith(`${ancestor}.`) || path.startsWith(`${ancestor}[`);
}
