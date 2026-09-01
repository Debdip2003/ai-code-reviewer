import { describe, it, expect } from 'vitest';
import { parseJavaScript } from '../../src/parser/parse-javascript.js';
import {
  analyzeReact,
  ReactAnalysisError
} from '../../src/analyzers/react-analyzer.js';

describe('React Static Analyzer (analyzeReact)', () => {
  describe('React File Detection (isReactFile)', () => {
    it('should detect React default import', () => {
      const source = `
        import React from 'react';
        export function Hello() { return <div>Hello</div>; }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/Hello.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/Hello.jsx' });
      expect(result.isReactFile).toBe(true);
    });

    it('should detect React namespace import', () => {
      const source = `
        import * as React from 'react';
        export const App = () => <span>App</span>;
      `;
      const ast = parseJavaScript({ source, filePath: 'src/App.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/App.jsx' });
      expect(result.isReactFile).toBe(true);
    });

    it('should detect named and aliased Hook imports', () => {
      const source = `
        import { useState, useEffect as useMyEffect } from 'react';
        export function Counter() {
          const [count, setCount] = useState(0);
          useMyEffect(() => {}, []);
          return <button>{count}</button>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/Counter.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/Counter.jsx' });
      expect(result.isReactFile).toBe(true);
      expect(result.stateVariables).toHaveLength(1);
      expect(result.stateVariables[0].stateName).toBe('count');
      expect(result.effects).toHaveLength(1);
    });

    it('should detect CommonJS require("react")', () => {
      const source = `
        const React = require('react');
        module.exports = function Box() { return <div>Box</div>; };
      `;
      const ast = parseJavaScript({ source, filePath: 'src/Box.js' });
      const result = analyzeReact({ ast, relativePath: 'src/Box.js' });
      expect(result.isReactFile).toBe(true);
    });

    it('should detect JSX even without explicit React import', () => {
      const source = `
        export const Header = () => <header><h1>Title</h1></header>;
      `;
      const ast = parseJavaScript({ source, filePath: 'src/Header.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/Header.jsx' });
      expect(result.isReactFile).toBe(true);
    });

    it('should return isReactFile: false for plain JavaScript without React patterns', () => {
      const source = `
        export function calculateSum(a, b) {
          return a + b;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/math.js' });
      const result = analyzeReact({ ast, relativePath: 'src/math.js' });
      expect(result.isReactFile).toBe(false);
      expect(result.components).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Component Detection & Size Rules', () => {
    it('should detect function, arrow, memo, forwardRef, and class components', () => {
      const source = `
        import React, { memo, forwardRef, Component, PureComponent } from 'react';

        export function FuncComp() {
          return <div>Func</div>;
        }

        export const ArrowComp = () => <div>Arrow</div>;

        export const MemoComp = memo(function InnerMemo() {
          return <div>Memo</div>;
        });

        export const ForwardComp = forwardRef((props, ref) => {
          return <button ref={ref}>Ref</button>;
        });

        export class ClassComp extends React.Component {
          render() { return <div>Class</div>; }
        }

        export class PureComp extends PureComponent {
          render() { return <div>Pure</div>; }
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/Components.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/Components.jsx' });

      expect(result.components).toHaveLength(6);
      const names = result.components.map((c) => c.name);
      expect(names).toContain('FuncComp');
      expect(names).toContain('ArrowComp');
      expect(names).toContain('MemoComp');
      expect(names).toContain('ForwardComp');
      expect(names).toContain('ClassComp');
      expect(names).toContain('PureComp');
    });

    it('should not classify uppercase utility functions that do not return JSX as components', () => {
      const source = `
        export function TransformData(input) {
          return { data: input.map(x => x * 2) };
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/utils.js' });
      const result = analyzeReact({ ast, relativePath: 'src/utils.js' });
      expect(result.components).toHaveLength(0);
    });

    it('should flag components exceeding maxComponentLines with appropriate severity', () => {
      const bodyLines = Array.from({ length: 25 }, (_, i) => `  const x${i} = ${i};`).join('\n');
      const source = `
        export function LargeComponent() {
        ${bodyLines}
          return <div>Large</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/LargeComponent.jsx' });

      // Threshold: 20 -> spans ~28 lines -> triggers medium severity
      const resultMedium = analyzeReact({
        ast,
        relativePath: 'src/LargeComponent.jsx',
        options: { maxComponentLines: 20 }
      });
      expect(resultMedium.findings.some((f) => f.ruleId === 'react/component-too-large')).toBe(true);
      const mediumFinding = resultMedium.findings.find((f) => f.ruleId === 'react/component-too-large');
      expect(mediumFinding.severity).toBe('medium');

      // Threshold: 10 -> spans ~28 lines -> >= 2 * 10 -> triggers high severity
      const resultHigh = analyzeReact({
        ast,
        relativePath: 'src/LargeComponent.jsx',
        options: { maxComponentLines: 10 }
      });
      const highFinding = resultHigh.findings.find((f) => f.ruleId === 'react/component-too-large');
      expect(highFinding.severity).toBe('high');
    });
  });

  describe('Direct State Mutation Detection (react/direct-state-mutation)', () => {
    it('should detect mutating array methods on React state', () => {
      const source = `
        import { useState } from 'react';
        export function ItemList() {
          const [items, setItems] = useState([]);

          function addItem(item) {
            items.push(item);
            items.splice(0, 1);
            items.sort();
          }

          return <ul>{items.length}</ul>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/ItemList.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/ItemList.jsx' });

      const mutationFindings = result.findings.filter((f) => f.ruleId === 'react/direct-state-mutation');
      expect(mutationFindings.length).toBeGreaterThanOrEqual(3);
      expect(mutationFindings[0].severity).toBe('high');
      expect(mutationFindings[0].category).toBe('correctness');
      expect(mutationFindings[0].suggestion).toContain('Create a new value and pass it to the state setter');
    });

    it('should detect element assignment, property assignment, and update expressions on React state', () => {
      const source = `
        import { useState } from 'react';
        export function StateTest() {
          const [data, setData] = useState({ count: 0, list: [] });

          function mutate() {
            data.list[0] = 'new';
            data.length = 0;
            data.count++;
          }

          return <div>{data.count}</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/StateTest.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/StateTest.jsx' });

      const mutationFindings = result.findings.filter((f) => f.ruleId === 'react/direct-state-mutation');
      expect(mutationFindings.length).toBeGreaterThanOrEqual(3);
    });

    it('should not flag non-mutating methods (map, filter, slice, concat)', () => {
      const source = `
        import { useState } from 'react';
        export function CleanState() {
          const [items, setItems] = useState([1, 2, 3]);

          function getFiltered() {
            const mapped = items.map(x => x * 2);
            const filtered = items.filter(x => x > 2);
            const sliced = items.slice(0, 1);
            return { mapped, filtered, sliced };
          }

          return <div>{items.length}</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/CleanState.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/CleanState.jsx' });

      const mutationFindings = result.findings.filter((f) => f.ruleId === 'react/direct-state-mutation');
      expect(mutationFindings).toHaveLength(0);
    });

    it('should not flag mutation on a copied array', () => {
      const source = `
        import { useState } from 'react';
        export function CopyState() {
          const [items, setItems] = useState([1, 2, 3]);

          function addItem(val) {
            const next = [...items];
            next.push(val);
            setItems(next);
          }

          return <div>{items.length}</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/CopyState.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/CopyState.jsx' });

      const mutationFindings = result.findings.filter((f) => f.ruleId === 'react/direct-state-mutation');
      expect(mutationFindings).toHaveLength(0);
    });

    it('should respect detectDirectStateMutation: false', () => {
      const source = `
        import { useState } from 'react';
        export function Mutator() {
          const [items, setItems] = useState([]);
          items.push(1);
          return <div>{items.length}</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/Mutator.jsx' });
      const result = analyzeReact({
        ast,
        relativePath: 'src/Mutator.jsx',
        options: { detectDirectStateMutation: false }
      });

      expect(result.findings.some((f) => f.ruleId === 'react/direct-state-mutation')).toBe(false);
    });
  });

  describe('Effect Rules (react/async-effect-callback, react/effect-too-large)', () => {
    it('should detect async effect callbacks with high severity', () => {
      const source = `
        import { useEffect } from 'react';
        export function AsyncEffectComp() {
          useEffect(async () => {
            await fetch('/api');
          }, []);
          return <div>Effect</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/AsyncEffectComp.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/AsyncEffectComp.jsx' });

      expect(result.findings.some((f) => f.ruleId === 'react/async-effect-callback')).toBe(true);
      const asyncFinding = result.findings.find((f) => f.ruleId === 'react/async-effect-callback');
      expect(asyncFinding.severity).toBe('high');
      expect(asyncFinding.category).toBe('correctness');
      expect(asyncFinding.suggestion).toContain('Define and call an async function inside the effect');
    });

    it('should not flag a synchronous effect callback that defines and calls an inner async function', () => {
      const source = `
        import { useEffect } from 'react';
        export function SyncEffectComp() {
          useEffect(() => {
            async function fetchData() {
              await fetch('/api');
            }
            fetchData();
          }, []);
          return <div>Sync Effect</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/SyncEffectComp.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/SyncEffectComp.jsx' });

      expect(result.findings.some((f) => f.ruleId === 'react/async-effect-callback')).toBe(false);
    });

    it('should detect large effect callbacks exceeding maxEffectLines', () => {
      const effectLines = Array.from({ length: 15 }, (_, i) => `    const temp${i} = ${i};`).join('\n');
      const source = `
        import { useEffect } from 'react';
        export function LargeEffectComp() {
          useEffect(() => {
        ${effectLines}
          }, []);
          return <div>Large Effect</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/LargeEffectComp.jsx' });
      const result = analyzeReact({
        ast,
        relativePath: 'src/LargeEffectComp.jsx',
        options: { maxEffectLines: 10 }
      });

      expect(result.findings.some((f) => f.ruleId === 'react/effect-too-large')).toBe(true);
      const largeFinding = result.findings.find((f) => f.ruleId === 'react/effect-too-large');
      expect(largeFinding.severity).toBe('medium');
    });
  });

  describe('Array-Index Key Rule (react/array-index-key)', () => {
    it('should detect array index used directly as key in .map()', () => {
      const source = `
        export function List({ items }) {
          return (
            <ul>
              {items.map((item, index) => (
                <li key={index}>{item.title}</li>
              ))}
            </ul>
          );
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/List.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/List.jsx' });

      expect(result.findings.some((f) => f.ruleId === 'react/array-index-key')).toBe(true);
      const keyFinding = result.findings.find((f) => f.ruleId === 'react/array-index-key');
      expect(keyFinding.severity).toBe('medium');
      expect(keyFinding.category).toBe('correctness');
      expect(keyFinding.suggestion).toContain('Use a stable identifier from the item');
    });

    it('should detect key={i} alias parameter', () => {
      const source = `
        export function List({ items }) {
          return (
            <div>
              {items.map((item, i) => <span key={i}>{item}</span>)}
            </div>
          );
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/List.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/List.jsx' });
      expect(result.findings.some((f) => f.ruleId === 'react/array-index-key')).toBe(true);
    });

    it('should not flag stable key={item.id}', () => {
      const source = `
        export function List({ items }) {
          return (
            <ul>
              {items.map((item, index) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          );
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/List.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/List.jsx' });
      expect(result.findings.some((f) => f.ruleId === 'react/array-index-key')).toBe(false);
    });

    it('should not flag composite template string keys in this conservative phase', () => {
      const source = `
        export function List({ items }) {
          return (
            <ul>
              {items.map((item, index) => (
                <li key={\`\${item.id}-\${index}\`}>{item.title}</li>
              ))}
            </ul>
          );
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/List.jsx' });
      const result = analyzeReact({ ast, relativePath: 'src/List.jsx' });
      expect(result.findings.some((f) => f.ruleId === 'react/array-index-key')).toBe(false);
    });

    it('should respect detectArrayIndexKeys: false', () => {
      const source = `
        export function List({ items }) {
          return (
            <ul>
              {items.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          );
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/List.jsx' });
      const result = analyzeReact({
        ast,
        relativePath: 'src/List.jsx',
        options: { detectArrayIndexKeys: false }
      });
      expect(result.findings.some((f) => f.ruleId === 'react/array-index-key')).toBe(false);
    });
  });

  describe('Analyzer Disabled and Error Handling', () => {
    it('should return empty result when options.enabled is false', () => {
      const source = `
        import { useState } from 'react';
        export function Test() {
          const [items] = useState([]);
          items.push(1);
          return <div>{items.length}</div>;
        }
      `;
      const ast = parseJavaScript({ source, filePath: 'src/Test.jsx' });
      const result = analyzeReact({
        ast,
        relativePath: 'src/Test.jsx',
        options: { enabled: false }
      });

      expect(result.isReactFile).toBe(false);
      expect(result.components).toHaveLength(0);
      expect(result.effects).toHaveLength(0);
      expect(result.stateVariables).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
    });

    it('should throw TypeError when relativePath is invalid', () => {
      const source = 'export const a = 1;';
      const ast = parseJavaScript({ source, filePath: 'src/test.js' });
      expect(() => analyzeReact({ ast, relativePath: '' })).toThrow(TypeError);
    });
  });
});
