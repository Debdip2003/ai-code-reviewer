import { describe, it, expect } from 'vitest';
import { planDependencyPlacement } from '../../../src/splitter/dependency-placement.js';

describe('Dependency Placement', () => {
  it('should move exclusive constants with candidate and leave shared declarations in source', () => {
    const candidate = {
      symbolName: 'ComponentA',
      dependencies: ['EXCLUSIVE_CONSTANT', 'SHARED_HELPER']
    };

    const dependencyGraph = {
      declarations: [
        {
          name: 'EXCLUSIVE_CONSTANT',
          kind: 'constant',
          dependencies: [],
          dependents: ['ComponentA'],
          exported: false
        },
        {
          name: 'SHARED_HELPER',
          kind: 'function',
          dependencies: [],
          dependents: ['ComponentA', 'ComponentB'],
          exported: true
        }
      ]
    };

    const result = planDependencyPlacement({ candidate, dependencyGraph });
    expect(result.movedDependencies).toContain('EXCLUSIVE_CONSTANT');
    expect(result.movedDependencies).not.toContain('SHARED_HELPER');
    expect(result.remainingDependencies).toContain('SHARED_HELPER');
  });
});
