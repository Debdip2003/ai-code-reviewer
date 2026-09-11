import { describe, it, expect } from 'vitest';
import { createExtractionContract, mapConventionalPropName, analyzeBindingUsage } from '../../../src/splitter/extraction-contract.js';
import { parseAst } from '../../../src/splitter/ast-utils.js';
import { buildDependencyGraph } from '../../../src/splitter/dependency-graph.js';

describe('Extraction Contract', () => {
  it('should map conventional event handler names to callback props', () => {
    expect(mapConventionalPropName('handleDelete')).toBe('onDelete');
    expect(mapConventionalPropName('handleChange')).toBe('onChange');
    expect(mapConventionalPropName('handleSaveItem')).toBe('onSaveItem');
    expect(mapConventionalPropName('handleSubmit')).toBe('onSubmit');
    expect(mapConventionalPropName('customFunction')).toBe('customFunction');
  });

  it('should correctly analyze binding usage within a node', () => {
    const source = `
      function Test() {
        const x = count + 1;
        handleClick(x);
      }
    `;
    const ast = parseAst(source, 'test.jsx');
    const funcNode = ast.program.body[0];

    expect(analyzeBindingUsage(funcNode, 'count')).toBe('read');
    expect(analyzeBindingUsage(funcNode, 'handleClick')).toBe('call');
  });

  it('should create complete boundary contract for a component candidate', () => {
    const source = `
      import React, { useMemo } from 'react';

      export const STATUS = 'active';

      export default function Container() {
        const user = { name: 'Alice' };
        function handleDelete() {}

        function Card() {
          return <div>{user.name}</div>;
        }

        return <Card />;
      }
    `;
    const ast = parseAst(source, 'Container.jsx');
    const graph = buildDependencyGraph({ ast, relativePath: 'Container.jsx' });

    const candidate = {
      id: 'card',
      symbolName: 'Card',
      kind: 'react-component',
      capturedBindings: ['user', 'handleDelete'],
      externalImports: ['useMemo'],
      dependencies: ['STATUS']
    };

    const contract = createExtractionContract({
      candidate,
      dependencyGraph: graph,
      ast,
      movedDependencies: ['STATUS'],
      remainingDependencies: []
    });

    expect(contract.symbol).toBe('Card');
    expect(contract.kind).toBe('react-component');
    expect(contract.capturedBindings).toEqual([
      { name: 'user', usage: 'read', resolution: 'prop', propName: 'user' },
      { name: 'handleDelete', usage: 'call', resolution: 'prop', propName: 'onDelete' }
    ]);
    expect(contract.movedDependencies).toEqual(['STATUS']);
    expect(contract.exports).toEqual([
      { name: 'Card', type: 'named' },
      { name: 'STATUS', type: 'named' }
    ]);
  });
});
