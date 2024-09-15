// @ts-expect-error TransactionManager is not part of the public root barrel
import type { TransactionManager } from "../src/index.js";

// @ts-expect-error CompilerContext is not part of the public root barrel
import type { CompilerContext } from "../src/index.js";

// @ts-expect-error EffectScheduler is not part of the public root barrel
import type { EffectScheduler } from "../src/index.js";

declare const transactionManager: TransactionManager;
declare const compilerContext: CompilerContext;
declare const effectScheduler: EffectScheduler;

void transactionManager;
void compilerContext;
void effectScheduler;
