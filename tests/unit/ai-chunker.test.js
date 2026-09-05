import { describe, it, expect } from 'vitest';
import { createSemanticChunks, estimateTokens } from '../../src/ai/chunker.js';
import { parseJavaScript } from '../../src/parser/parse-javascript.js';

describe('AI Semantic Chunker', () => {
  it('should estimate token counts conservatively (3 chars per token)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcdef')).toBe(2);
    expect(estimateTokens('abcdefg')).toBe(3);
  });

  it('should chunk functions, arrow functions, classes, and React components', () => {
    const source = `import React from 'react';
import { helper } from './utils';

export function calculateTotal(items) {
  return items.reduce((acc, it) => acc + it.price, 0);
}

export const processPayment = async (amount) => {
  return await api.pay(amount);
};

export class OrderService {
  process() {}
}

export function OrderWidget({ order }) {
  return <div>{order.id}</div>;
}
`;
    const ast = parseJavaScript({ source, filePath: 'src/orders.jsx' });
    const { chunks, skipped } = createSemanticChunks({
      source,
      ast,
      relativePath: 'src/orders.jsx',
      maxInputTokens: 5000
    });

    expect(skipped).toHaveLength(0);
    expect(chunks.length).toBeGreaterThanOrEqual(4);

    const calcChunk = chunks.find((c) => c.symbolName === 'calculateTotal');
    expect(calcChunk).toBeDefined();
    expect(calcChunk.kind).toBe('function-declaration');
    expect(calcChunk.imports).toContain("import React from 'react';");
    expect(calcChunk.imports).toContain("import { helper } from './utils';");
    expect(calcChunk.code).toContain('calculateTotal(items)');

    const reactChunk = chunks.find((c) => c.symbolName === 'OrderWidget');
    expect(reactChunk).toBeDefined();
    expect(reactChunk.kind).toBe('react-component');
  });

  it('should maintain absolute file line numbers for each chunk', () => {
    const source = `// Header comment
// Line 2
export function first() {
  return 1;
}

// Line 7
export function second() {
  return 2;
}
`;
    const ast = parseJavaScript({ source, filePath: 'src/lines.js' });
    const { chunks } = createSemanticChunks({
      source,
      ast,
      relativePath: 'src/lines.js'
    });

    const firstChunk = chunks.find((c) => c.symbolName === 'first');
    expect(firstChunk.lineStart).toBe(3);
    expect(firstChunk.lineEnd).toBe(5);

    const secondChunk = chunks.find((c) => c.symbolName === 'second');
    expect(secondChunk.lineStart).toBe(8);
    expect(secondChunk.lineEnd).toBe(10);
  });

  it('should generate deterministic chunk IDs', () => {
    const source = 'export function add(a, b) { return a + b; }';
    const ast = parseJavaScript({ source, filePath: 'src/math.js' });
    const { chunks: chunks1 } = createSemanticChunks({ source, ast, relativePath: 'src/math.js' });
    const { chunks: chunks2 } = createSemanticChunks({ source, ast, relativePath: 'src/math.js' });

    expect(chunks1[0].id).toBe('src/math.js:add:1-1');
    expect(chunks1[0].id).toBe(chunks2[0].id);
  });

  it('should skip oversized semantic units exceeding maxInputTokens with reason "token-limit"', () => {
    const hugeBody = 'console.log("data");\n'.repeat(500);
    const source = `export function hugeFunction() {\n${hugeBody}\n}`;
    const ast = parseJavaScript({ source, filePath: 'src/huge.js' });

    const { chunks, skipped } = createSemanticChunks({
      source,
      ast,
      relativePath: 'src/huge.js',
      maxInputTokens: 100 // Very low limit to force skipping
    });

    expect(chunks).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('token-limit');
    expect(skipped[0].symbolName).toBe('hugeFunction');
    expect(skipped[0].estimatedInputTokens).toBeGreaterThan(100);
  });

  it('should handle small module without functions as a module chunk', () => {
    const source = 'export const CONFIG = { api: "https://example.com" };';
    const ast = parseJavaScript({ source, filePath: 'src/config.js' });

    const { chunks } = createSemanticChunks({
      source,
      ast,
      relativePath: 'src/config.js'
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].kind).toBe('module');
    expect(chunks[0].symbolName).toBe('module');
  });

  it('should not mutate input source string', () => {
    const source = 'export function run() { return true; }';
    const original = String(source);
    const ast = parseJavaScript({ source, filePath: 'src/pure.js' });

    createSemanticChunks({ source, ast, relativePath: 'src/pure.js' });

    expect(source).toBe(original);
  });
});
