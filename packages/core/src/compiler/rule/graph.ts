import type { CompiledRule } from "../../model/rule.js";
import type { ModelPath } from "../../path/index.js";

export interface ComputedGraphResult {
  readonly order: readonly string[];
  readonly cycle?: readonly string[];
}

export function buildComputedGraph(
  rules: readonly CompiledRule[],
  writers: ReadonlyMap<ModelPath, string>,
): ComputedGraphResult {
  const computed = rules.filter((rule) => rule.kind === "computed");
  const ids = computed.map((rule) => rule.id);
  const idSet = new Set(ids);
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const id of ids) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }

  for (const rule of computed) {
    for (const dependency of rule.dependencies) {
      const writer = writers.get(dependency);
      if (writer === undefined || !idSet.has(writer)) {
        continue;
      }
      incoming.get(rule.id)?.add(writer);
      outgoing.get(writer)?.add(rule.id);
    }
  }

  const cycle = findCycle(ids, outgoing);
  if (cycle !== undefined) {
    return { order: [], cycle };
  }

  const index = new Map(ids.map((id, position) => [id, position]));
  const remaining = new Map(incoming);
  const ready = ids.filter((id) => (remaining.get(id)?.size ?? 0) === 0);
  const order: string[] = [];
  const sortReady = (): void => {
    ready.sort((left, right) => (index.get(left) ?? 0) - (index.get(right) ?? 0));
  };
  sortReady();
  while (ready.length > 0) {
    const next = ready.shift()!;
    order.push(next);
    for (const consumer of outgoing.get(next) ?? []) {
      const set = remaining.get(consumer);
      if (set === undefined) {
        continue;
      }
      set.delete(next);
      if (set.size === 0) {
        ready.push(consumer);
        sortReady();
      }
    }
  }

  if (order.length !== ids.length) {
    return { order: [], cycle: findCycle(ids, outgoing) ?? ids };
  }
  return { order };
}

function findCycle(
  ids: readonly string[],
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] | undefined {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  for (const id of ids) {
    const cycle = visit(id, outgoing, state, stack);
    if (cycle !== undefined) {
      return cycle;
    }
  }
  return undefined;
}

function visit(
  id: string,
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
  state: Map<string, 0 | 1 | 2>,
  stack: string[],
): readonly string[] | undefined {
  const current = state.get(id) ?? 0;
  if (current === 1) {
    const start = stack.indexOf(id);
    return start >= 0 ? [...stack.slice(start), id] : [id, id];
  }
  if (current === 2) {
    return undefined;
  }
  state.set(id, 1);
  stack.push(id);
  for (const next of outgoing.get(id) ?? []) {
    const cycle = visit(next, outgoing, state, stack);
    if (cycle !== undefined) {
      return cycle;
    }
  }
  stack.pop();
  state.set(id, 2);
  return undefined;
}
