import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  proposeFileName,
  getDefaultTargetDirectory,
  resolveTargetPaths,
  normalizePath
} from '../../../src/splitter/target-path.js';

describe('Target Path Resolver', () => {
  it('should propose .jsx for react components and .js for hooks, services, utilities, and constants', () => {
    expect(proposeFileName({ kind: 'react-component', symbolName: 'ProductCard' }, 'ProductPage.jsx')).toBe('ProductCard.jsx');
    expect(proposeFileName({ kind: 'custom-hook', symbolName: 'useProducts' }, 'ProductPage.jsx')).toBe('useProducts.js');
    expect(proposeFileName({ kind: 'service', symbolName: 'fetchProducts' }, 'ProductPage.jsx')).toBe('product.service.js');
    expect(proposeFileName({ kind: 'utility', symbolName: 'formatPrice' }, 'ProductPage.jsx')).toBe('product.utils.js');
    expect(proposeFileName({ kind: 'constant-group', symbolName: 'productStatusLabels' }, 'ProductPage.jsx')).toBe('product.constants.js');
  });

  it('should derive default target directory alongside source file', () => {
    expect(getDefaultTargetDirectory('src/ProductPage.jsx')).toBe('src/ProductPage');
    expect(getDefaultTargetDirectory('src/utils/helpers.js')).toBe('src/utils/helpers');
    expect(getDefaultTargetDirectory('ProductPage.jsx')).toBe('ProductPage');
  });

  it('should resolve target paths with custom target directory', () => {
    const candidates = [
      { id: '1', kind: 'react-component', symbolName: 'Card' },
      { id: '2', kind: 'utility', symbolName: 'format' }
    ];
    const result = resolveTargetPaths({
      candidates,
      sourceFile: 'src/Page.jsx',
      projectRoot: process.cwd(),
      targetDirectory: 'src/components/Page'
    });

    expect(result.targetDirectory).toBe('src/components/Page');
    expect(result.candidatesWithTargets[0].targetFile).toBe('src/components/Page/Card.jsx');
  });

  it('should reject path traversal outside project root', () => {
    const candidates = [{ id: '1', kind: 'react-component', symbolName: 'Card' }];
    expect(() =>
      resolveTargetPaths({
        candidates,
        sourceFile: 'src/Page.jsx',
        projectRoot: process.cwd(),
        targetDirectory: '../../outside'
      })
    ).toThrow(/escapes project root/);
  });

  it('should normalize Windows paths with forward slashes', () => {
    expect(normalizePath('src\\components\\Card.jsx')).toBe('src/components/Card.jsx');
    expect(normalizePath('C:\\project\\src\\file.js')).toBe('C:/project/src/file.js');
  });
});
