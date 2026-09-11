import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validatePreApply,
  validatePostWrite
} from '../../../src/splitter/apply/apply-validator.js';
import { calculateSha256 } from '../../../src/splitter/apply/write-utils.js';
import {
  ApplyNotAllowedError,
  SourceChangedError,
  SplitInputError,
  TargetCollisionError,
  TargetOutsideProjectError,
  PostWriteValidationError
} from '../../../src/splitter/split-errors.js';

describe('apply-validator unit tests', () => {
  const validPlan = {
    sourceFile: 'src/App.jsx',
    targetFile: 'src/Card.jsx',
    candidate: {
      id: 'card',
      symbol: 'Card',
      kind: 'react-component',
      safety: 'automatic-ready'
    },
    validation: {
      sourceParseable: true,
      targetParseable: true,
      unresolvedBindings: [],
      cycles: [],
      errors: []
    }
  };

  it('should reject manual-review candidate with ApplyNotAllowedError', () => {
    const plan = {
      ...validPlan,
      candidate: {
        ...validPlan.candidate,
        safety: 'manual-review'
      }
    };

    expect(() =>
      validatePreApply({
        plan,
        projectRoot: '/project',
        sourceFile: 'src/App.jsx',
        targetFile: 'src/Card.jsx'
      })
    ).toThrow(ApplyNotAllowedError);
  });

  it('should reject non-existent source file with SplitInputError', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-val-test-'));

    expect(() =>
      validatePreApply({
        plan: validPlan,
        projectRoot: tempDir,
        sourceFile: 'src/Missing.jsx',
        targetFile: 'src/Card.jsx'
      })
    ).toThrow(SplitInputError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject existing target file with TargetCollisionError', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-val-collision-'));
    const sourcePath = path.join(tempDir, 'src', 'App.jsx');
    const targetPath = path.join(tempDir, 'src', 'Card.jsx');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'export function App() {}');
    fs.writeFileSync(targetPath, 'export function Card() {}'); // already exists

    expect(() =>
      validatePreApply({
        plan: validPlan,
        projectRoot: tempDir,
        sourceFile: 'src/App.jsx',
        targetFile: 'src/Card.jsx'
      })
    ).toThrow(TargetCollisionError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject target escaping project root with TargetOutsideProjectError', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-val-escape-'));
    const sourcePath = path.join(tempDir, 'src', 'App.jsx');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'export function App() {}');

    expect(() =>
      validatePreApply({
        plan: validPlan,
        projectRoot: tempDir,
        sourceFile: 'src/App.jsx',
        targetFile: '../../outside.jsx'
      })
    ).toThrow(TargetOutsideProjectError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject source file modified after plan creation with SourceChangedError', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-val-changed-'));
    const sourcePath = path.join(tempDir, 'src', 'App.jsx');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'export function App() { return 1; }');

    const oldHash = calculateSha256('export function App() { return 0; }'); // different hash

    expect(() =>
      validatePreApply({
        plan: validPlan,
        projectRoot: tempDir,
        sourceFile: 'src/App.jsx',
        targetFile: 'src/Card.jsx',
        plannedSourceHash: oldHash
      })
    ).toThrow(SourceChangedError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pass post-write validation when files are correctly written and structured', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-val-post-'));
    const sourcePath = path.join(tempDir, 'src', 'App.jsx');
    const targetPath = path.join(tempDir, 'src', 'Card.jsx');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      "import { Card } from './Card.jsx';\nexport function App() { return <Card />; }\n"
    );
    fs.writeFileSync(
      targetPath,
      'import React from "react";\nexport function Card() { return <div>Card</div>; }\n'
    );

    const res = await validatePostWrite({
      projectRoot: tempDir,
      sourceFile: 'src/App.jsx',
      targetFile: 'src/Card.jsx',
      candidate: { id: 'card', symbol: 'Card', kind: 'react-component' },
      contract: { imports: [], exports: [] }
    });

    expect(res.preWrite).toBe('passed');
    expect(res.postWrite).toBe('passed');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail post-write validation if extracted symbol is missing in target file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-val-post-fail-'));
    const sourcePath = path.join(tempDir, 'src', 'App.jsx');
    const targetPath = path.join(tempDir, 'src', 'Card.jsx');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      "import { Card } from './Card.jsx';\nexport function App() { return <Card />; }\n"
    );
    fs.writeFileSync(
      targetPath,
      'export function OtherComponent() { return <div />; }\n'
    ); // Card is missing!

    await expect(
      validatePostWrite({
        projectRoot: tempDir,
        sourceFile: 'src/App.jsx',
        targetFile: 'src/Card.jsx',
        candidate: { id: 'card', symbol: 'Card', kind: 'react-component' },
        contract: { imports: [], exports: [] }
      })
    ).rejects.toThrow(PostWriteValidationError);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
