import { describe, it, expect } from 'vitest';
import { detectImportCycles } from '../../../src/splitter/cycle-detector.js';

describe('Cycle Detector', () => {
  it('should detect circular dependency cycles accurately', () => {
    const graph = new Map([
      ['a.js', new Set(['b.js'])],
      ['b.js', new Set(['c.js'])],
      ['c.js', new Set(['a.js'])]
    ]);

    const result = detectImportCycles(graph, 'a.js');
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toEqual(['a.js', 'b.js', 'c.js', 'a.js']);
  });

  it('should return hasCycle false for acyclic DAG', () => {
    const graph = new Map([
      ['a.js', new Set(['b.js', 'c.js'])],
      ['b.js', new Set(['d.js'])],
      ['c.js', new Set(['d.js'])],
      ['d.js', new Set()]
    ]);

    const result = detectImportCycles(graph, 'a.js');
    expect(result.hasCycle).toBe(false);
    expect(result.cyclePath).toEqual([]);
  });
});
