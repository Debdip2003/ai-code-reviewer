import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewRepository } from '../../src/review/review-engine.js';
import { loadConfig } from '../../src/config/load-config.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import { EXIT_CODES } from '../../src/review/exit-codes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesRoot = path.resolve(__dirname, '../fixtures');

describe('E2E Review Suite', () => {
  it('passes cleanly on the clean fixture with zero findings', async () => {
    const cleanDir = path.join(fixturesRoot, 'clean');
    const config = await loadConfig({ rootDirectory: cleanDir, cliOverrides: { cache: { enabled: false } } });
    const result = await reviewRepository({ rootDirectory: cleanDir, config });

    expect(result.summary.discovered).toBe(1);
    expect(result.summary.analyzed).toBe(1);
    expect(result.failures).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
    expect(result.summary.timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('detects ESLint bugs in javascript-problems fixture', async () => {
    const jsDir = path.join(fixturesRoot, 'javascript-problems');
    const config = await loadConfig({ rootDirectory: jsDir, cliOverrides: { cache: { enabled: false } } });
    const result = await reviewRepository({ rootDirectory: jsDir, config });

    expect(result.summary.discovered).toBe(1);
    expect(result.findings.length).toBeGreaterThan(0);
    const ruleIds = result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('no-unreachable');
    expect(ruleIds).toContain('use-isnan');
  });

  it('detects React anti-patterns in react-problems fixture', async () => {
    const reactDir = path.join(fixturesRoot, 'react-problems');
    const config = await loadConfig({ rootDirectory: reactDir, cliOverrides: { cache: { enabled: false } } });
    const result = await reviewRepository({ rootDirectory: reactDir, config });

    expect(result.summary.discovered).toBe(1);
    const ruleIds = result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('react/async-effect-callback');
    expect(ruleIds).toContain('react/direct-state-mutation');
    expect(ruleIds).toContain('react/array-index-key');
  });

  it('detects complexity issues in complexity-problems fixture', async () => {
    const complexDir = path.join(fixturesRoot, 'complexity-problems');
    const config = await loadConfig({ rootDirectory: complexDir, cliOverrides: { cache: { enabled: false } } });
    const result = await reviewRepository({ rootDirectory: complexDir, config });

    expect(result.summary.discovered).toBe(1);
    const ruleIds = result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('complexity/too-many-parameters');
    expect(ruleIds).toContain('complexity/high-cyclomatic-complexity');
    expect(ruleIds).toContain('complexity/deep-nesting');
  });

  it('executes doctor diagnostics successfully', async () => {
    const cleanDir = path.join(fixturesRoot, 'clean');
    const doctorReport = await runDoctorChecks(cleanDir);

    expect(doctorReport.nodeSupported).toBe(true);
    expect(doctorReport.rootValid).toBe(true);
    expect(doctorReport.configValid).toBe(true);
    expect(doctorReport.checks.length).toBeGreaterThan(5);
  });

  it('aborts review gracefully when AbortSignal is triggered', async () => {
    const jsDir = path.join(fixturesRoot, 'javascript-problems');
    const config = await loadConfig({ rootDirectory: jsDir, cliOverrides: { cache: { enabled: false } } });
    const controller = new AbortController();
    controller.abort();

    const result = await reviewRepository({ rootDirectory: jsDir, config, signal: controller.signal });
    expect(result.failures.some((f) => f.stage === 'interrupted' || f.reason.includes('interrupted'))).toBe(true);
  });
});
