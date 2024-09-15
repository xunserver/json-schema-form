export interface GraphPlugin {
  readonly id: string;
  readonly ordinal: number;
  readonly dependsOn: readonly string[];
}

export interface MissingDependency {
  readonly pluginId: string;
  readonly ordinal: number;
  readonly dependency: string;
}

export interface DependencyCycle {
  readonly path: readonly string[];
  readonly ordinal: number;
}

export interface PluginGraphResult {
  readonly order: readonly string[];
  readonly missing: readonly MissingDependency[];
  readonly cycles: readonly DependencyCycle[];
}

export function resolvePluginGraph(plugins: readonly GraphPlugin[]): PluginGraphResult {
  const knownIds = new Set(plugins.map((plugin) => plugin.id));
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const adj = new Map<string, string[]>();
  const missing: MissingDependency[] = [];

  for (const plugin of plugins) {
    if (!adj.has(plugin.id)) {
      adj.set(plugin.id, []);
    }
  }

  for (const plugin of plugins) {
    const seenDeps = new Set<string>();
    for (const dependency of plugin.dependsOn) {
      if (seenDeps.has(dependency)) {
        continue;
      }
      seenDeps.add(dependency);

      if (!knownIds.has(dependency)) {
        missing.push({
          pluginId: plugin.id,
          ordinal: plugin.ordinal,
          dependency,
        });
        continue;
      }

      addEdge(adj, dependency, plugin.id);
    }
  }

  const topo = stableTopo(plugins, adj);
  const cycles = topo === undefined ? detectCycles(plugins, adj, byId) : [];

  return {
    order: topo ?? plugins.map((plugin) => plugin.id),
    missing,
    cycles,
  };
}

function addEdge(adj: Map<string, string[]>, from: string, to: string): void {
  const list = adj.get(from) ?? [];
  if (!list.includes(to)) {
    list.push(to);
    adj.set(from, list);
  }
}

function stableTopo(
  plugins: readonly GraphPlugin[],
  adj: Map<string, readonly string[]>,
): string[] | undefined {
  const indegree = new Map<string, number>(plugins.map((plugin) => [plugin.id, 0]));
  for (const tos of adj.values()) {
    for (const to of tos) {
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }

  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const ready = plugins
    .filter((plugin) => indegree.get(plugin.id) === 0)
    .sort(compareOrdinalThenId);
  const order: string[] = [];

  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) {
      break;
    }
    order.push(next.id);
    for (const to of adj.get(next.id) ?? []) {
      const nextDegree = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, nextDegree);
      if (nextDegree === 0) {
        const plugin = byId.get(to);
        if (plugin !== undefined) {
          insertSorted(ready, plugin);
        }
      }
    }
  }

  if (order.length !== plugins.length) {
    return undefined;
  }

  return order;
}

function detectCycles(
  plugins: readonly GraphPlugin[],
  adj: Map<string, string[]>,
  byId: Map<string, GraphPlugin>,
): DependencyCycle[] {
  const remaining = new Set(kahnRemainder(plugins, adj));
  if (remaining.size === 0) {
    return [];
  }

  const remainingAdj = new Map<string, string[]>();
  for (const id of remaining) {
    remainingAdj.set(
      id,
      (adj.get(id) ?? []).filter((to) => remaining.has(to)),
    );
  }

  const cycles: DependencyCycle[] = [];
  for (const scc of tarjan([...remaining], remainingAdj)) {
    const nodes = new Set(scc);
    const hasSelfLoop = scc.some((id) => (remainingAdj.get(id) ?? []).includes(id));
    if (scc.length < 2 && !hasSelfLoop) {
      continue;
    }

    const start = [...scc].sort((left, right) => {
      const leftOrdinal = byId.get(left)?.ordinal ?? 0;
      const rightOrdinal = byId.get(right)?.ordinal ?? 0;
      if (leftOrdinal !== rightOrdinal) {
        return leftOrdinal - rightOrdinal;
      }
      return left < right ? -1 : left > right ? 1 : 0;
    })[0];

    if (start === undefined) {
      continue;
    }

    const path = findCyclePath(start, nodes, remainingAdj, (id) => byId.get(id)?.ordinal ?? 0);
    cycles.push({
      path: Object.freeze(path),
      ordinal: byId.get(start)?.ordinal ?? 0,
    });
  }

  return cycles.sort((left, right) => {
    if (left.ordinal !== right.ordinal) {
      return left.ordinal - right.ordinal;
    }
    const leftStart = left.path[0] ?? "";
    const rightStart = right.path[0] ?? "";
    return leftStart < rightStart ? -1 : leftStart > rightStart ? 1 : 0;
  });
}

function kahnRemainder(
  plugins: readonly GraphPlugin[],
  adj: Map<string, readonly string[]>,
): string[] {
  const indegree = new Map<string, number>(plugins.map((plugin) => [plugin.id, 0]));
  for (const tos of adj.values()) {
    for (const to of tos) {
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }

  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const ready = plugins
    .filter((plugin) => indegree.get(plugin.id) === 0)
    .sort(compareOrdinalThenId);
  const visited = new Set<string>();

  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) {
      break;
    }
    visited.add(next.id);
    for (const to of adj.get(next.id) ?? []) {
      const nextDegree = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, nextDegree);
      if (nextDegree === 0) {
        const plugin = byId.get(to);
        if (plugin !== undefined) {
          insertSorted(ready, plugin);
        }
      }
    }
  }

  return plugins.map((plugin) => plugin.id).filter((id) => !visited.has(id));
}

function tarjan(ids: readonly string[], adj: Map<string, readonly string[]>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const sccs: string[][] = [];

  function strongconnect(id: string): void {
    indices.set(id, index);
    lowlink.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);

    for (const next of adj.get(id) ?? []) {
      if (!indices.has(next)) {
        strongconnect(next);
        lowlink.set(id, Math.min(lowlink.get(id) ?? 0, lowlink.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowlink.set(id, Math.min(lowlink.get(id) ?? 0, indices.get(next) ?? 0));
      }
    }

    if (lowlink.get(id) === indices.get(id)) {
      const scc: string[] = [];
      while (true) {
        const node = stack.pop();
        if (node === undefined) {
          break;
        }
        onStack.delete(node);
        scc.push(node);
        if (node === id) {
          break;
        }
      }
      sccs.push(scc);
    }
  }

  for (const id of ids) {
    if (!indices.has(id)) {
      strongconnect(id);
    }
  }

  return sccs;
}

function findCyclePath(
  start: string,
  scc: ReadonlySet<string>,
  adj: Map<string, readonly string[]>,
  ordinalOf: (id: string) => number,
): string[] {
  const neighborsOf = (id: string): string[] =>
    [...(adj.get(id) ?? [])]
      .filter((next) => scc.has(next))
      .sort((left, right) => {
        const ordinalDelta = ordinalOf(left) - ordinalOf(right);
        if (ordinalDelta !== 0) {
          return ordinalDelta;
        }
        return left < right ? -1 : left > right ? 1 : 0;
      });

  if (neighborsOf(start).includes(start)) {
    return [start, start];
  }

  const path: string[] = [start];
  const inPath = new Set<string>([start]);

  function dfs(current: string): string[] | undefined {
    for (const next of neighborsOf(current)) {
      if (next === start && path.length > 1) {
        return [...path, start];
      }
      if (inPath.has(next)) {
        continue;
      }
      path.push(next);
      inPath.add(next);
      const found = dfs(next);
      if (found !== undefined) {
        return found;
      }
      path.pop();
      inPath.delete(next);
    }
    return undefined;
  }

  return dfs(start) ?? [start, start];
}

function compareOrdinalThenId(left: GraphPlugin, right: GraphPlugin): number {
  if (left.ordinal !== right.ordinal) {
    return left.ordinal - right.ordinal;
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function insertSorted(ready: GraphPlugin[], plugin: GraphPlugin): void {
  const index = ready.findIndex((item) => compareOrdinalThenId(plugin, item) < 0);
  if (index === -1) {
    ready.push(plugin);
  } else {
    ready.splice(index, 0, plugin);
  }
}
