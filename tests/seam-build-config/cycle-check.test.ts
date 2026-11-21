import { findCycles } from '@root/scripts/lib/cycle-core';

const graphOf = (edges: Record<string, string[]>) => new Map(Object.entries(edges));

describe('Seam: circular dependency detection', () => {
  it('reports nothing for an acyclic graph', () => {
    expect(findCycles(graphOf({ a: ['b', 'c'], b: ['c'], c: [] }))).toEqual([]);
  });

  it('finds a two-node cycle and a longer cycle as separate groups', () => {
    const cycles = findCycles(
      graphOf({ a: ['b'], b: ['a'], x: ['y'], y: ['z'], z: ['x'], free: ['a'] }),
    );
    expect(cycles).toEqual([
      ['a', 'b'],
      ['x', 'y', 'z'],
    ]);
  });

  it('finds a self import and ignores edges to files outside the graph', () => {
    expect(findCycles(graphOf({ a: ['a'], b: ['outside.ts'] }))).toEqual([['a']]);
  });
});
