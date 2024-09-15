// @ts-expect-error TransactionManager is not exported from the public runtime barrel
import type { TransactionManager } from "../src/runtime/index.js";
// @ts-expect-error ChangeQueue is not exported from the public runtime barrel
import type { ChangeQueue } from "../src/runtime/index.js";
// @ts-expect-error ValueStoreImpl is not exported from the public runtime barrel
import type { ValueStoreImpl } from "../src/runtime/index.js";
// @ts-expect-error EffectScheduler is not exported from the public runtime barrel
import type { EffectScheduler } from "../src/runtime/index.js";
// @ts-expect-error Environment identity is not exported from the public runtime barrel
import type { EnvironmentIdentity } from "../src/runtime/index.js";
// @ts-expect-error ArrayStateStore is not exported from the public runtime barrel
import type { ArrayStateStore } from "../src/runtime/index.js";
// @ts-expect-error RuntimeNodeId is not exported from the public runtime barrel
import type { RuntimeNodeId } from "../src/runtime/index.js";
// @ts-expect-error RuleDynamicsEngine is not exported from the public runtime barrel
import type { RuleDynamicsEngine } from "../src/runtime/index.js";
// @ts-expect-error View state store is not exported from the public runtime barrel
import type { ViewStateStore } from "../src/runtime/index.js";
// @ts-expect-error Change set types are not exported from the public runtime barrel
import type { NormalizedChangeSet } from "../src/runtime/index.js";
// @ts-expect-error evaluateRuleExpression is not exported from the public runtime barrel
import { evaluateRuleExpression } from "../src/runtime/index.js";
// @ts-expect-error ValidationEngine is not exported from the public runtime barrel
import type { ValidationEngine } from "../src/runtime/index.js";
// @ts-expect-error ErrorStore is not exported from the public runtime barrel
import type { ErrorStore } from "../src/runtime/index.js";

declare const transactionManager: TransactionManager;
declare const changeQueue: ChangeQueue;
declare const valueStore: ValueStoreImpl;
declare const scheduler: EffectScheduler;
declare const identity: EnvironmentIdentity;
void transactionManager;
void changeQueue;
void valueStore;
void scheduler;
void identity;

declare const arrayStore: ArrayStateStore;
declare const runtimeNodeId: RuntimeNodeId;
void arrayStore;
void runtimeNodeId;

declare const engine: RuleDynamicsEngine;
void engine;
void evaluateRuleExpression;
declare const viewStore: ViewStateStore;
declare const changeSet: NormalizedChangeSet;
void viewStore;
void changeSet;
declare const validationEngine: ValidationEngine;
declare const errorStore: ErrorStore;
void validationEngine;
void errorStore;
