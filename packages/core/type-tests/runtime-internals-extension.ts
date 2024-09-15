// @ts-expect-error TransactionManager is not exported from the public extension barrel
import type { TransactionManager } from "../src/extension/index.js";
// @ts-expect-error ChangeQueue is not exported from the public extension barrel
import type { ChangeQueue } from "../src/extension/index.js";
// @ts-expect-error ValueStoreImpl is not exported from the public extension barrel
import type { ValueStoreImpl } from "../src/extension/index.js";
// @ts-expect-error EffectScheduler is not exported from the public extension barrel
import type { EffectScheduler } from "../src/extension/index.js";
// @ts-expect-error Environment identity is not exported from the public extension barrel
import type { EnvironmentIdentity } from "../src/extension/index.js";

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
