import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../bin/cli.js');

describe('CLI Integration Tests', () => {
  it('should display help and exit successfully when invoked with --help', () => {
    const result = spawnSync(process.execPath, [cliPath, '--help'], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ai-code-reviewer');
    expect(result.stdout).toContain('review');
    expect(result.stdout).toContain('init');
  });

  it('should display version information when invoked with --version', () => {
    const result = spawnSync(process.execPath, [cliPath, '--version'], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0.1.0');
  });

  it('should handle review command invocation with default arguments', () => {
    const result = spawnSync(process.execPath, [cliPath, 'review'], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Review command received:');
    expect(result.stdout).toContain('Target path:');
    expect(result.stdout).toContain('Output format: terminal');
    expect(result.stdout).toContain('Changed only:  false');
  });

  it('should handle review command with custom arguments and flags', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'review', './src', '--format', 'json', '--changed'],
      {
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Review command received:');
    expect(result.stdout).toContain('Output format: json');
    expect(result.stdout).toContain('Changed only:  true');
  });

  it('should handle init command invocation', () => {
    const result = spawnSync(process.execPath, [cliPath, 'init'], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Initializing ai-code-reviewer configuration');
  });
});
