import { describe, it, expect } from 'vitest';
import { parseJavaScript } from '../../../src/parser/parse-javascript.js';
import { buildDependencyGraph } from '../../../src/splitter/dependency-graph.js';
import { detectSplitCandidates } from '../../../src/splitter/candidate-detector.js';

describe('Candidate Detector', () => {
  it('should detect React child components and preserve primary page component', () => {
    const source = `
      import React from 'react';

      export function ProductCard({ item }) {
        return <div className="card">{item.title}</div>;
      }

      export default function ProductPage({ items }) {
        return (
          <div>
            {items.map(it => <ProductCard key={it.id} item={it} />)}
          </div>
        );
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'ProductPage.jsx' });
    const graph = buildDependencyGraph({ ast, relativePath: 'ProductPage.jsx' });
    const candidates = detectSplitCandidates({
      ast,
      source,
      relativePath: 'ProductPage.jsx',
      dependencyGraph: graph,
      options: { minCandidateLines: 3 }
    });

    const cardCand = candidates.find((c) => c.symbolName === 'ProductCard');
    expect(cardCand).toBeDefined();
    expect(cardCand.kind).toBe('react-component');
    expect(cardCand.safeForFutureExtraction).toBe(true);

    // Primary component ProductPage should be preserved in place
    const pageCand = candidates.find((c) => c.symbolName === 'ProductPage');
    expect(pageCand).toBeUndefined();
  });

  it('should detect custom hooks and verify dependencies', () => {
    const source = `
      import { useState, useEffect } from 'react';

      export function useCounter(initial = 0) {
        const [count, setCount] = useState(initial);
        const inc = () => setCount(c => c + 1);
        return { count, inc };
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'useCounter.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'useCounter.js' });
    const candidates = detectSplitCandidates({
      ast,
      source,
      relativePath: 'useCounter.js',
      dependencyGraph: graph
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].kind).toBe('custom-hook');
    expect(candidates[0].symbolName).toBe('useCounter');
    expect(candidates[0].safeForFutureExtraction).toBe(true);
  });

  it('should detect pure utilities and ignore trivial one-liners', () => {
    const source = `
      export function trivial(x) { return x + 1; }

      export function complexFormatter(value, precision = 2, prefix = '$') {
        if (value === null || value === undefined) return '';
        const num = Number(value);
        if (Number.isNaN(num)) return '';
        const fixed = num.toFixed(precision);
        return prefix + fixed.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'formatters.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'formatters.js' });
    const candidates = detectSplitCandidates({
      ast,
      source,
      relativePath: 'formatters.js',
      dependencyGraph: graph,
      options: { minCandidateLines: 5 }
    });

    expect(candidates.some((c) => c.symbolName === 'trivial')).toBe(false);
    const formatterCand = candidates.find((c) => c.symbolName === 'complexFormatter');
    expect(formatterCand).toBeDefined();
    expect(formatterCand.kind).toBe('utility');
    expect(formatterCand.safeForFutureExtraction).toBe(true);
  });

  it('should detect services making fetch calls', () => {
    const source = `
      export async function fetchUserData(userId) {
        const response = await fetch('/api/users/' + userId);
        return response.json();
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'userService.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'userService.js' });
    const candidates = detectSplitCandidates({
      ast,
      source,
      relativePath: 'userService.js',
      dependencyGraph: graph
    });

    const serviceCand = candidates.find((c) => c.symbolName === 'fetchUserData');
    expect(serviceCand).toBeDefined();
    expect(serviceCand.kind).toBe('service');
    expect(serviceCand.safeForFutureExtraction).toBe(true);
  });

  it('should detect constant groups and reject side-effectful constants', () => {
    const source = `
      export const STATUS_CODES = {
        ACTIVE: 'active',
        PENDING: 'pending',
        INACTIVE: 'inactive'
      };

      export const SIDE_EFFECTFUL = console.log('side effect');
    `;
    const ast = parseJavaScript({ source, filePath: 'constants.js' });
    const graph = buildDependencyGraph({ ast, relativePath: 'constants.js' });
    const candidates = detectSplitCandidates({
      ast,
      source,
      relativePath: 'constants.js',
      dependencyGraph: graph
    });

    const statusCand = candidates.find((c) => c.symbolName === 'STATUS_CODES');
    expect(statusCand).toBeDefined();
    expect(statusCand.kind).toBe('constant-group');
    expect(statusCand.safeForFutureExtraction).toBe(true);

    const sideEffectCand = candidates.find((c) => c.symbolName === 'SIDE_EFFECTFUL');
    if (sideEffectCand) {
      expect(sideEffectCand.safeForFutureExtraction).toBe(false);
      expect(sideEffectCand.risks.some((r) => r.includes('side effects'))).toBe(true);
    }
  });

  it('should flag nested closures capturing outer state as unsafe manual review candidates', () => {
    const source = `
      import React, { useState } from 'react';

      export default function Container() {
        const [state, setState] = useState(0);

        function handleAction() {
          setState(state + 1);
        }

        return <button onClick={handleAction}>Click</button>;
      }
    `;
    const ast = parseJavaScript({ source, filePath: 'Container.jsx' });
    const graph = buildDependencyGraph({ ast, relativePath: 'Container.jsx' });
    const candidates = detectSplitCandidates({
      ast,
      source,
      relativePath: 'Container.jsx',
      dependencyGraph: graph
    });

    const actionCand = candidates.find((c) => c.symbolName === 'handleAction');
    expect(actionCand).toBeDefined();
    expect(actionCand.safeForFutureExtraction).toBe(false);
    expect(actionCand.capturedBindings).toContain('state');
    expect(actionCand.capturedBindings).toContain('setState');
    expect(actionCand.risks.length).toBeGreaterThan(0);
  });
});
