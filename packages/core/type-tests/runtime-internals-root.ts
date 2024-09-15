// @ts-expect-error TransactionManager is not part of the public root barrel
import type { TransactionManager } from "../src/index.js";
// @ts-expect-error ChangeQueue is not part of the public root barrel
import type { ChangeQueue } from "../src/index.js";
// @ts-expect-error ValueStoreImpl is not part of the public root barrel
import type { ValueStoreImpl } from "../src/index.js";
// @ts-expect-error EffectScheduler is not part of the public root barrel
import type { EffectScheduler } from "../src/index.js";
// @ts-expect-error Environment identity is not part of the public root barrel
import type { EnvironmentIdentity } from "../src/index.js";
// @ts-expect-error ArrayStateStore is not part of the public root barrel
import type { ArrayStateStore } from "../src/index.js";
// @ts-expect-error RuntimeNodeId is not part of the public root barrel
import type { RuntimeNodeId } from "../src/index.js";
// @ts-expect-error RuleDynamicsEngine is not part of the public root barrel
import type { RuleDynamicsEngine } from "../src/index.js";
// @ts-expect-error DependencyScheduler is not part of the public root barrel
import type { DependencyScheduler } from "../src/index.js";
// @ts-expect-error evaluateRuleExpression is not part of the public root barrel
import { evaluateRuleExpression } from "../src/index.js";

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
declare const dependencyScheduler: DependencyScheduler;
void engine;
void dependencyScheduler;
void evaluateRuleExpression;
