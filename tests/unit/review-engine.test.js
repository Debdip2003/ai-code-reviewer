import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { reviewRepository } from '../../src/review/review-engine.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

describe('reviewRepository engine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-reviewer-engine-test-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should review clean repository and return zero findings', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src', 'app.js'),
      'export function greet(name) { return `Hello, ${name}`; }'
    );

    const result = await reviewRepository({
      rootDirectory: tempDir,
      config: DEFAULT_CONFIG
    });

    expect(result.summary.discovered).toBe(1);
    expect(result.summary.parsed).toBe(1);
    expect(result.summary.analyzed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.findings).toBe(0);
    expect(result.summary.functionsAnalyzed).toBe(1);
    expect(result.summary.componentsAnalyzed).toBe(0);
    expect(result.summary.effectsAnalyzed).toBe(0);
    expect(result.summary.stateVariablesTracked).toBe(0);
    expect(result.summary.findingsBySource).toEqual({ eslint: 0, complexity: 0, react: 0, ai: 0 });
    expect(result.findings).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('should combine and aggregate findings from ESLint, complexity, React, and AI analyzers', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src', 'bad1.js'),
      'export function calc() { return undefinedVariable * 2; }' // ESLint no-undef
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'complex.js'),
      `export function complexFunc(a, b, c, d, e, f) {
        if (a) return 1;
        if (b) return 2;
        if (c) return 3;
        return 0;
      }` // 6 parameters
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'ReactComp.jsx'),
      `import { useState } from 'react';
      export function BadComponent() {
        const [items, setItems] = useState([]);
        items.push('direct');
        return <div>{items.length}</div>;
      }` // React direct state mutation
    );

    const mockAiProvider = {
      reviewChunk: async ({ chunk }) => {
        if (chunk.symbolName === 'complexFunc') {
          return {
            findings: [
              {
                ruleId: 'ai/missing-input-validation',
                severity: 'medium',
                category: 'correctness',
                title: 'Missing input validation',
                message: 'Function inputs a-f are not validated before evaluation.',
                lineStart: 1,
                lineEnd: 6,
                suggestion: 'Add validation guards',
                confidence: 0.9
              }
            ],
            usage: { inputTokens: 80, outputTokens: 30 }
          };
        }
        return { findings: [], usage: { inputTokens: 50, outputTokens: 5 } };
      }
    };

    const customConfig = {
      ...DEFAULT_CONFIG,
      analyzers: {
        ...DEFAULT_CONFIG.analyzers,
        complexity: {
          ...DEFAULT_CONFIG.analyzers.complexity,
          maxParameters: 5
        }
      },
      ai: {
        ...DEFAULT_CONFIG.ai,
        enabled: true
      }
    };

    const result = await reviewRepository({
      rootDirectory: tempDir,
      config: customConfig,
      aiProvider: mockAiProvider
    });

    expect(result.summary.discovered).toBe(3);
    expect(result.summary.analyzed).toBe(3);
    expect(result.summary.findings).toBeGreaterThanOrEqual(4);
    expect(result.findings.some((f) => f.source === 'eslint' && f.ruleId === 'no-undef')).toBe(true);
    expect(result.findings.some((f) => f.source === 'complexity' && f.ruleId === 'complexity/too-many-parameters')).toBe(true);
    expect(result.findings.some((f) => f.source === 'react' && f.ruleId === 'react/direct-state-mutation')).toBe(true);
    expect(result.findings.some((f) => f.source === 'ai' && f.ruleId === 'ai/missing-input-validation')).toBe(true);
    expect(result.summary.findingsBySource.eslint).toBeGreaterThanOrEqual(1);
    expect(result.summary.findingsBySource.complexity).toBeGreaterThanOrEqual(1);
    expect(result.summary.findingsBySource.react).toBeGreaterThanOrEqual(1);
    expect(result.summary.findingsBySource.ai).toBe(1);
    expect(result.summary.ai.enabled).toBe(true);
    expect(result.summary.ai.chunksReviewed).toBeGreaterThanOrEqual(1);
    expect(result.summary.componentsAnalyzed).toBeGreaterThanOrEqual(1);
    expect(result.summary.stateVariablesTracked).toBeGreaterThanOrEqual(1);
  });

  it('should isolate failures without blocking valid files', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src', 'broken.js'),
      'const a = ;'
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'valid.js'),
      'export function run() { return true; }'
    );

    const result = await reviewRepository({
      rootDirectory: tempDir,
      config: DEFAULT_CONFIG
    });

    expect(result.summary.discovered).toBe(2);
    expect(result.summary.parsed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].relativePath).toBe('src/broken.js');
    expect(result.failures[0].stage).toBe('parse');
  });

  it('should not modify any reviewed source files', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    const originalContent = 'export function check(a, b) { return a == b; }\n';
    const filePath = path.join(tempDir, 'src', 'code.js');
    await fs.writeFile(filePath, originalContent, 'utf-8');

    await reviewRepository({
      rootDirectory: tempDir,
      config: DEFAULT_CONFIG
    });

    const afterContent = await fs.readFile(filePath, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });
});
