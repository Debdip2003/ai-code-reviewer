import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  acquireLock,
  releaseLock,
  getLockFilePath
} from '../../../src/splitter/apply/change-lock.js';
import { OperationLockedError } from '../../../src/splitter/split-errors.js';

describe('change-lock unit tests', () => {
  it('should acquire and release lock file cleanly', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-lock-test-'));
    const opId = '20260911T143012Z-a4f82c';

    const acquired = acquireLock({ projectRoot: tempDir, operationId: opId });
    expect(acquired).toBe(true);

    const lockPath = getLockFilePath(tempDir);
    expect(fs.existsSync(lockPath)).toBe(true);

    const released = releaseLock({ projectRoot: tempDir, operationId: opId });
    expect(released).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject acquisition when another active operation holds the lock', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-lock-conflict-'));
    const op1 = '20260911T143012Z-111111';
    const op2 = '20260911T143012Z-222222';

    acquireLock({ projectRoot: tempDir, operationId: op1 });

    expect(() =>
      acquireLock({ projectRoot: tempDir, operationId: op2, staleTimeoutMs: 600000 })
    ).toThrow(OperationLockedError);

    releaseLock({ projectRoot: tempDir, operationId: op1 });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should automatically reclaim stale locks with non-existent PIDs or expired timestamps', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-lock-stale-'));
    const lockPath = getLockFilePath(tempDir);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });

    // Write fake stale lock with PID 999999 and timestamp 1 hour ago
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        operationId: 'old-op-id',
        pid: 999999,
        createdAt: new Date(Date.now() - 3600000).toISOString()
      })
    );

    const newOp = '20260911T143012Z-newop1';
    const acquired = acquireLock({
      projectRoot: tempDir,
      operationId: newOp,
      staleTimeoutMs: 60000
    });

    expect(acquired).toBe(true);
    releaseLock({ projectRoot: tempDir, operationId: newOp });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
