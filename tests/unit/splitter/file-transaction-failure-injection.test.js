import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeFileTransaction } from '../../../src/splitter/apply/file-transaction.js';
import { calculateSha256 } from '../../../src/splitter/apply/write-utils.js';
import { readOperationManifest } from '../../../src/splitter/apply/operation-manifest.js';
import { getBackupDirectory } from '../../../src/splitter/apply/backup-manager.js';

describe('file-transaction failure injection & automatic rollback tests', () => {
  const opId = '20260911T143012Z-failtest';
  const originalSource = 'export function App() { return <div>Original</div>; }\n';
  const newSource = 'import { Card } from "./Card.jsx";\nexport function App() { return <Card />; }\n';
  const newTarget = 'import React from "react";\nexport function Card() { return <div>Card</div>; }\n';

  it('should automatically roll back and restore source if failure occurs after target is renamed', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-tx-fail-target-'));
    const sourceFile = 'src/App.jsx';
    const targetFile = 'src/Card.jsx';
    const absSource = path.join(tempDir, sourceFile);
    const absTarget = path.join(tempDir, targetFile);

    fs.mkdirSync(path.dirname(absSource), { recursive: true });
    fs.writeFileSync(absSource, originalSource);
    const beforeHash = calculateSha256(originalSource);

    const plan = {
      sourceFile,
      targetFile,
      candidate: { id: 'card', symbol: 'Card', kind: 'react-component', safety: 'automatic-ready' },
      contract: { imports: [], exports: [], capturedBindings: [] },
      validation: { sourceParseable: true, targetParseable: true, unresolvedBindings: [], cycles: [], errors: [] },
      sourceHash: beforeHash,
      before: { sourceHash: beforeHash, targetExisted: false }
    };

    // Injected hook: throw immediately after target is renamed
    const _hooks = {
      onAfterTargetRename: async () => {
        throw new Error('SIMULATED CRASH AFTER TARGET RENAME');
      }
    };

    await expect(
      executeFileTransaction({
        projectRoot: tempDir,
        operationId: opId,
        plan,
        proposedSourceCode: newSource,
        proposedTargetCode: newTarget,
        _hooks
      })
    ).rejects.toThrow('SIMULATED CRASH AFTER TARGET RENAME');

    // Verify automatic rollback:
    // 1. Source file is still original content
    expect(fs.readFileSync(absSource, 'utf8')).toBe(originalSource);
    // 2. Created target file was cleaned up / deleted
    expect(fs.existsSync(absTarget)).toBe(false);

    // 3. Manifest records rolled-back-after-failure
    const manifestPath = path.join(getBackupDirectory(tempDir, opId), 'manifest.json');
    const manifest = readOperationManifest(manifestPath);
    expect(manifest.status).toBe('rolled-back-after-failure');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should automatically roll back and restore original source if post-write validation fails', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-tx-fail-post-'));
    const sourceFile = 'src/App.jsx';
    const targetFile = 'src/Card.jsx';
    const absSource = path.join(tempDir, sourceFile);
    const absTarget = path.join(tempDir, targetFile);

    fs.mkdirSync(path.dirname(absSource), { recursive: true });
    fs.writeFileSync(absSource, originalSource);
    const beforeHash = calculateSha256(originalSource);

    const plan = {
      sourceFile,
      targetFile,
      candidate: { id: 'card', symbol: 'Card', kind: 'react-component', safety: 'automatic-ready' },
      contract: { imports: [], exports: [], capturedBindings: [] },
      validation: { sourceParseable: true, targetParseable: true, unresolvedBindings: [], cycles: [], errors: [] },
      sourceHash: beforeHash,
      before: { sourceHash: beforeHash, targetExisted: false }
    };

    // Injected hook: throw during post validation
    const _hooks = {
      onBeforePostValidation: async () => {
        throw new Error('SIMULATED POST VALIDATION FAILURE');
      }
    };

    await expect(
      executeFileTransaction({
        projectRoot: tempDir,
        operationId: opId,
        plan,
        proposedSourceCode: newSource,
        proposedTargetCode: newTarget,
        _hooks
      })
    ).rejects.toThrow('SIMULATED POST VALIDATION FAILURE');

    // Automatic rollback verified:
    expect(fs.readFileSync(absSource, 'utf8')).toBe(originalSource);
    expect(fs.existsSync(absTarget)).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
