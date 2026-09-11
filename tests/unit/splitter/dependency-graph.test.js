import { describe, it, expect } from 'vitest';
import { parseJavaScript } from '../../../src/parser/parse-javascript.js';
import { buildDependencyGraph } from '../../../src/splitter/dependency-graph.js';

describe('Dependency Graph Builder', () => {
  it('should track imports, named imports, and import aliases', () => {
    const source = `
      import React, { useState as useMyState, useEffect } from 'react';
      import * as utils from './utils.js';

      export function MyComponent() {
        const [x, setX] = useMyState(0);
        return <div>{x}</div>;
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'test.jsx' });
    const graph = buildDependencyGraph({ ast, relativePath: 'test.jsx' });

    expect(graph.imports.length).toBe(4);
    const useMyStateImport = graph.imports.find((i) => i.localName === 'useMyState');

    expect(useMyStateImport).toBeDefined();
    expect(useMyStateImport.importedName).toBe('useState');
    expect(useMyStateImport.source).toBe('react');

    const componentDecl = graph.declarations.find((d) => d.name === 'MyComponent');
    expect(componentDecl).toBeDefined();
    expect(componentDecl.externalImports).toContain('useMyState');
  });

  it('should track top-level dependencies and reverse dependents', () => {
    const source = `
      export const TAX_RATE = 0.08;

      export function calculateTotal(subtotal) {
        return subtotal + (subtotal * TAX_RATE);
      }

      export function processOrder(amount) {
        return calculateTotal(amount);
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'order.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'order.js' });

    const taxDecl = graph.declarations.find((d) => d.name === 'TAX_RATE');
    const calcDecl = graph.declarations.find((d) => d.name === 'calculateTotal');
    const procDecl = graph.declarations.find((d) => d.name === 'processOrder');

    expect(calcDecl.dependencies).toContain('TAX_RATE');
    expect(taxDecl.dependents).toContain('calculateTotal');

    expect(procDecl.dependencies).toContain('calculateTotal');
    expect(calcDecl.dependents).toContain('processOrder');
  });

  it('should not confuse shadowed variables with outer dependencies', () => {
    const source = `
      export const value = 100;

      export function compute(value) {
        // 'value' here is a parameter, shadowing top-level 'value'
        return value * 2;
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'shadow.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'shadow.js' });

    const computeDecl = graph.declarations.find((d) => d.name === 'compute');
    expect(computeDecl.dependencies).not.toContain('value');
  });

  it('should handle JSX identifiers as dependencies', () => {
    const source = `
      import React from 'react';

      export function ChildCard({ title }) {
        return <h3>{title}</h3>;
      }

      export function ParentSection() {
        return (
          <section>
            <ChildCard title="Hello" />
          </section>
        );
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'jsx.jsx' });
    const graph = buildDependencyGraph({ ast, relativePath: 'jsx.jsx' });

    const parentDecl = graph.declarations.find((d) => d.name === 'ParentSection');
    expect(parentDecl.dependencies).toContain('ChildCard');
  });

  it('should ignore object property keys and properly handle computed properties', () => {
    const source = `
      const config = { host: 'localhost', port: 8080 };
      const fieldKey = 'port';

      export function getPort() {
        const obj = { host: 123 };
        return config[fieldKey] + obj.host;
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'props.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'props.js' });

    const getPortDecl = graph.declarations.find((d) => d.name === 'getPort');
    expect(getPortDecl.dependencies).toContain('config');
    expect(getPortDecl.dependencies).toContain('fieldKey');
    expect(getPortDecl.dependencies).not.toContain('host');
    expect(getPortDecl.dependencies).not.toContain('port');
  });

  it('should correctly distinguish named exports and default exports', () => {
    const source = `
      export function namedOne() {}
      export const namedTwo = 2;
      export default function defaultMain() {}
    `;
    const ast = parseJavaScript({ source, filePath: 'exports.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'exports.js' });

    const namedOne = graph.declarations.find((d) => d.name === 'namedOne');
    const namedTwo = graph.declarations.find((d) => d.name === 'namedTwo');
    const defaultMain = graph.declarations.find((d) => d.name === 'defaultMain');

    expect(namedOne.exported).toBe(true);
    expect(namedOne.defaultExport).toBe(false);

    expect(namedTwo.exported).toBe(true);
    expect(namedTwo.defaultExport).toBe(false);

    expect(defaultMain.exported).toBe(true);
    expect(defaultMain.defaultExport).toBe(true);
  });

  it('should return deterministically sorted entries without AST nodes', () => {
    const source = `
      const Z = 1;
      const A = 2;
      function foo() { return A + Z; }
    `;
    const ast = parseJavaScript({ source, filePath: 'order.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'order.js' });

    expect(graph.declarations[0].name).toBe('Z');
    expect(graph.declarations[1].name).toBe('A');
    expect(graph.declarations[2].name).toBe('foo');

    // Verify serializability (JSON roundtrip without circular structures)
    const json = JSON.stringify(graph);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json);
    expect(parsed.declarations.length).toBe(3);
  });
});
