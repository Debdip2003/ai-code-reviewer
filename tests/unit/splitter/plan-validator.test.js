import { describe, it, expect } from 'vitest';
import { validateSplitPlan } from '../../../src/splitter/plan-validator.js';

describe('Plan Validator', () => {
  const dependencyGraph = {
    relativePath: 'src/ProductPage.jsx',
    imports: [],
    declarations: [
      { name: 'ProductCard', kind: 'react-component', lineStart: 10, lineEnd: 50, exported: false },
      { name: 'ProductPage', kind: 'react-component', lineStart: 60, lineEnd: 100, exported: true }
    ]
  };

  const validPlan = {
    version: 1,
    mode: 'dry-run',
    sourceFile: 'src/ProductPage.jsx',
    targetDirectory: 'src/ProductPage',
    sourceSummary: {
      lines: 100,
      declarations: 2,
      imports: 0,
      exports: 1
    },
    candidates: [
      {
        id: 'cand-ProductCard-10',
        kind: 'react-component',
        symbolName: 'ProductCard',
        lineStart: 10,
        lineEnd: 50,
        targetFile: 'src/ProductPage/ProductCard.jsx',
        reason: 'Independent component.',
        confidence: 0.95,
        dependencies: [],
        dependents: ['ProductPage'],
        externalImports: [],
        capturedBindings: [],
        safeForFutureExtraction: true,
        risks: []
      }
    ],
    warnings: [],
    summary: {
      detected: 1,
      safe: 1,
      unsafe: 0,
      conflicts: 0
    }
  };

  it('should validate a clean, correct plan', () => {
    const result = validateSplitPlan({
      plan: validPlan,
      dependencyGraph,
      projectRoot: process.cwd()
    });
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should flag candidates whose range exceeds file line count', () => {
    const invalidPlan = {
      ...validPlan,
      sourceSummary: { ...validPlan.sourceSummary, lines: 30 }
    };
    const result = validateSplitPlan({
      plan: invalidPlan,
      dependencyGraph,
      projectRoot: process.cwd()
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds source file length'))).toBe(true);
  });

  it('should flag safe candidates that contain captured bindings', () => {
    const invalidPlan = {
      ...validPlan,
      candidates: [
        {
          ...validPlan.candidates[0],
          safeForFutureExtraction: true,
          capturedBindings: ['outerVar']
        }
      ]
    };
    const result = validateSplitPlan({
      plan: invalidPlan,
      dependencyGraph,
      projectRoot: process.cwd()
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unresolved captured bindings'))).toBe(true);
  });

  it('should emit warnings when circular dependencies exist between candidates', () => {
    const circularPlan = {
      ...validPlan,
      candidates: [
        {
          id: 'cand-A',
          kind: 'utility',
          symbolName: 'funcA',
          lineStart: 5,
          lineEnd: 15,
          targetFile: 'src/ProductPage/funcA.js',
          reason: 'Helper A',
          confidence: 0.85,
          dependencies: ['funcB'],
          dependents: ['funcB'],
          externalImports: [],
          capturedBindings: [],
          safeForFutureExtraction: true,
          risks: []
        },
        {
          id: 'cand-B',
          kind: 'utility',
          symbolName: 'funcB',
          lineStart: 20,
          lineEnd: 30,
          targetFile: 'src/ProductPage/funcB.js',
          reason: 'Helper B',
          confidence: 0.85,
          dependencies: ['funcA'],
          dependents: ['funcA'],
          externalImports: [],
          capturedBindings: [],
          safeForFutureExtraction: true,
          risks: []
        }
      ],
      summary: {
        detected: 2,
        safe: 2,
        unsafe: 0,
        conflicts: 0
      }
    };
    const result = validateSplitPlan({
      plan: circularPlan,
      dependencyGraph,
      projectRoot: process.cwd()
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('Circular dependency'))).toBe(true);
  });
});
