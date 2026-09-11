import { describe, it, expect } from 'vitest';
import { toKebabId, parseAst } from '../../../src/splitter/ast-utils.js';
import { buildDependencyGraph } from '../../../src/splitter/dependency-graph.js';
import { detectSplitCandidates } from '../../../src/splitter/candidate-detector.js';

describe('Stable Candidate IDs', () => {
  it('should convert various casing styles to kebab-case correctly', () => {
    expect(toKebabId('UserCard')).toBe('user-card');
    expect(toKebabId('useUserSearch')).toBe('use-user-search');
    expect(toKebabId('formatDate')).toBe('format-date');
    expect(toKebabId('PRODUCT_STATUS_LABELS')).toBe('product-status-labels');
    expect(toKebabId('fetchUserData')).toBe('fetch-user-data');
    expect(toKebabId('calculateDiscount')).toBe('calculate-discount');
  });

  it('should append deterministic collision suffixes for duplicate symbol kebab IDs', () => {
    const source = `
      export function formatDate(d) {
        return String(d);
      }

      export function FormatDate(d) {
        return <span>{d}</span>;
      }
    `;
    const ast = parseAst(source, 'format.jsx');
    const graph = buildDependencyGraph({ ast, relativePath: 'format.jsx' });
    const candidates = detectSplitCandidates({
      ast,
      source,
      relativePath: 'format.jsx',
      dependencyGraph: graph,
      options: { minCandidateLines: 1 }
    });

    expect(candidates.length).toBe(2);
    expect(candidates[0].id).toBe('format-date');
    expect(candidates[1].id).toBe('format-date-2');
  });

  it('should maintain stable candidate IDs even when unrelated lines are added at the beginning', () => {
    const source1 = `
      export function calculateTotal(items) {
        return items.reduce((a, b) => a + b, 0);
      }
    `;
    const source2 = `
      // Some comments added at line 1
      // Line 2
      // Line 3
      import foo from 'bar';

      export function calculateTotal(items) {
        return items.reduce((a, b) => a + b, 0);
      }
    `;

    const ast1 = parseAst(source1, 'calc1.js');
    const graph1 = buildDependencyGraph({ ast: ast1, relativePath: 'calc1.js' });
    const c1 = detectSplitCandidates({
      ast: ast1,
      source: source1,
      relativePath: 'calc1.js',
      dependencyGraph: graph1,
      options: { minCandidateLines: 1 }
    });

    const ast2 = parseAst(source2, 'calc2.js');
    const graph2 = buildDependencyGraph({ ast: ast2, relativePath: 'calc2.js' });
    const c2 = detectSplitCandidates({
      ast: ast2,
      source: source2,
      relativePath: 'calc2.js',
      dependencyGraph: graph2,
      options: { minCandidateLines: 1 }
    });

    expect(c1[0].id).toBe('calculate-total');
    expect(c2[0].id).toBe('calculate-total');
    expect(c1[0].id).toBe(c2[0].id);
  });
});
