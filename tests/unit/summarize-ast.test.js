import { describe, it, expect } from 'vitest';
import { parseJavaScript } from '../../src/parser/parse-javascript.js';
import { summarizeAst } from '../../src/parser/summarize-ast.js';

describe('summarizeAst', () => {
  it('should summarize imports correctly', () => {
    const source = `
      import React, { useState, useEffect } from 'react';
      import * as utils from './utils.js';
      import './styles.css';
    `;
    const ast = parseJavaScript({ source, filePath: 'src/App.jsx' });
    const summary = summarizeAst({ ast, relativePath: 'src/App.jsx' });

    expect(summary.imports).toHaveLength(3);
    expect(summary.imports[0]).toEqual({
      source: 'react',
      specifierCount: 3,
      line: 2
    });
    expect(summary.imports[1]).toEqual({
      source: './utils.js',
      specifierCount: 1,
      line: 3
    });
    expect(summary.imports[2]).toEqual({
      source: './styles.css',
      specifierCount: 0,
      line: 4
    });
  });

  it('should summarize named and default exports', () => {
    const source = `
      export const apiKey = '123';
      export function calculateTotal(a, b) { return a + b; }
      export class Calculator {}
      export { apiKey as key };
      export default function DefaultHandler() {}
    `;
    const ast = parseJavaScript({ source, filePath: 'src/exports.js' });
    const summary = summarizeAst({ ast, relativePath: 'src/exports.js' });

    expect(summary.exports).toEqual([
      { kind: 'named', name: 'apiKey', line: 2 },
      { kind: 'named', name: 'calculateTotal', line: 3 },
      { kind: 'named', name: 'Calculator', line: 4 },
      { kind: 'named', name: 'key', line: 5 },
      { kind: 'default', name: 'DefaultHandler', line: 6 }
    ]);
  });

  it('should identify function declarations, arrow functions, and classes', () => {
    const source = `
      function helper() {}
      async function asyncFetch() {}
      const ArrowFunc = async () => {};
      const expressionFunc = function() {};
      class DataStore {}
    `;
    const ast = parseJavaScript({ source, filePath: 'src/types.js' });
    const summary = summarizeAst({ ast, relativePath: 'src/types.js' });

    expect(summary.functions).toEqual([
      { name: 'helper', kind: 'function-declaration', async: false, line: 2 },
      { name: 'asyncFetch', kind: 'function-declaration', async: true, line: 3 },
      { name: 'ArrowFunc', kind: 'arrow-function', async: true, line: 4 },
      { name: 'expressionFunc', kind: 'function-expression', async: false, line: 5 }
    ]);

    expect(summary.classes).toEqual([
      { name: 'DataStore', line: 6 }
    ]);
  });

  it('should identify uppercase declarations as React component candidates and exclude lowercase functions', () => {
    const source = `
      export function UserCard({ name }) { return null; }
      export const Button = () => null;
      export class ModalComponent {}
      function calculateSum() { return 0; }
      const formatCurrency = (val) => val;
    `;
    const ast = parseJavaScript({ source, filePath: 'src/Components.jsx' });
    const summary = summarizeAst({ ast, relativePath: 'src/Components.jsx' });

    expect(summary.reactComponentCandidates).toEqual([
      { name: 'UserCard', kind: 'function', line: 2 },
      { name: 'Button', kind: 'function', line: 3 },
      { name: 'ModalComponent', kind: 'class', line: 4 }
    ]);
  });

  it('should handle anonymous default exports gracefully without crashing', () => {
    const source = `
      export default function() { return null; }
    `;
    const ast = parseJavaScript({ source, filePath: 'src/anon.js' });
    const summary = summarizeAst({ ast, relativePath: 'src/anon.js' });

    expect(summary.exports).toEqual([
      { kind: 'default', name: 'default', line: 2 }
    ]);
  });

  it('should produce deterministic output across multiple invocations', () => {
    const source = `
      import React from 'react';
      export const App = () => <div>Hello</div>;
      export default App;
    `;
    const ast1 = parseJavaScript({ source, filePath: 'src/App.jsx' });
    const ast2 = parseJavaScript({ source, filePath: 'src/App.jsx' });

    const summary1 = summarizeAst({ ast: ast1, relativePath: 'src/App.jsx' });
    const summary2 = summarizeAst({ ast: ast2, relativePath: 'src/App.jsx' });

    expect(summary1).toEqual(summary2);
  });
});
