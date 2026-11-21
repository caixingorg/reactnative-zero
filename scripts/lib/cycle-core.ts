// 原因：循环依赖检测是纯图算法，与文件系统和 TypeScript 解析分离，便于单测；
// 采用 Tarjan 强连通分量，规模大于 1 的分量（或带自环的节点）即为循环依赖
export type ImportGraph = ReadonlyMap<string, readonly string[]>;

export function findCycles(graph: ImportGraph): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  // 原因：递归深度等于最长依赖链，源码规模下足够安全，避免为此引入显式栈的复杂度
  function visit(node: string): void {
    indices.set(node, index);
    lowlinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) {
        continue;
      }
      if (!indices.has(next)) {
        visit(next);
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, lowlinks.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, indices.get(next) ?? 0));
      }
    }

    if (lowlinks.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member !== undefined) {
          onStack.delete(member);
          component.push(member);
        }
      } while (member !== undefined && member !== node);
      const selfLoop = component.length === 1 && (graph.get(node) ?? []).includes(node);
      if (component.length > 1 || selfLoop) {
        cycles.push(component.sort());
      }
    }
  }

  for (const node of [...graph.keys()].sort()) {
    if (!indices.has(node)) {
      visit(node);
    }
  }
  return cycles.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
}
