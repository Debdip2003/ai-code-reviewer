import { describe, it, expect } from 'vitest';
import { planExports } from '../../../src/splitter/export-planner.js';

describe('Export Planner', () => {
  it('should plan named exports for extracted candidates and re-exports when originally exported', () => {
    const candidate = {
      symbolName: 'UserCard'
    };

    const dependencyGraph = {
      declarations: [
        {
          name: 'UserCard',
          exported: true,
          defaultExport: false
        }
      ]
    };

    const result = planExports({
      candidate,
      movedDependencies: [],
      dependencyGraph,
      targetFile: 'src/components/UserCard.jsx',
      sourceFile: 'src/components/Dashboard.jsx'
    });

    expect(result.targetExports).toEqual([{ name: 'UserCard', type: 'named' }]);
    expect(result.sourceReExports).toEqual([
      { name: 'UserCard', type: 'named', source: 'UserCard' }
    ]);
  });
});
