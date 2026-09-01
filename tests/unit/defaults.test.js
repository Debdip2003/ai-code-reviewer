import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  CONFIG_FILE_NAME,
  IGNORE_FILE_NAME
} from '../../src/config/defaults.js';

describe('DEFAULT_CONFIG and Constants', () => {
  it('should export expected constant file names', () => {
    expect(CONFIG_FILE_NAME).toBe('.aireviewerrc.json');
    expect(IGNORE_FILE_NAME).toBe('.aireviewerignore');
  });

  it('should contain all required default configuration fields', () => {
    expect(DEFAULT_CONFIG).toEqual({
      include: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '.next/**',
        'public/**',
        'vendor/**',
        '**/*.min.js'
      ],
      outputFormat: 'terminal',
      concurrency: 2,
      severityThreshold: 'medium',
      maxFiles: 100,
      maxFileSizeKb: 150,
      analyzers: {
        complexity: {
          enabled: true,
          maxFunctionLines: 80,
          maxParameters: 5,
          maxCyclomaticComplexity: 10,
          maxNestingDepth: 4
        },
        react: {
          enabled: true,
          hooks: true,
          maxComponentLines: 200,
          maxEffectLines: 50,
          detectDirectStateMutation: true,
          detectArrayIndexKeys: true
        }
      }
    });
  });

  it('should be deeply frozen and immutable', () => {
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.include)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.exclude)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.analyzers)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.analyzers.complexity)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.analyzers.react)).toBe(true);

    expect(() => {
      // @ts-expect-error - testing immutability
      DEFAULT_CONFIG.concurrency = 5;
    }).toThrow();

    expect(() => {
      // @ts-expect-error - testing immutability
      DEFAULT_CONFIG.analyzers.react.enabled = false;
    }).toThrow();
  });
});
