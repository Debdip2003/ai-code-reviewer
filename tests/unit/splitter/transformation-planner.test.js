import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createTransformationPlan } from '../../../src/splitter/transformation-planner.js';
import { CandidateNotFoundError, TargetOutsideProjectError } from '../../../src/splitter/split-errors.js';

describe('Transformation Planner', () => {
  const projectRoot = path.resolve(process.cwd());

  it('should generate transformation preview for nested React component with captured props', async () => {
    const fixturePath = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const result = await createTransformationPlan({
      projectRoot,
      filePath: fixturePath,
      candidateId: 'user-card',
      includePreview: true
    });

    expect(result.plan).toBeDefined();
    expect(result.plan.version).toBe(2);
    expect(result.plan.candidate.id).toBe('user-card');
    expect(result.plan.candidate.symbol).toBe('UserCard');
    expect(result.plan.candidate.safety).toBe('manual-review'); // Captured parent values
    expect(result.plan.filesModified).toBe(0);

    // Check generated target code
    expect(result.proposedTargetCode).toContain('export function UserCard');
    expect(result.proposedTargetCode).toContain('selectedUser');
    expect(result.proposedTargetCode).toContain('onDelete');
    expect(result.proposedTargetCode).toContain('onDelete(selectedUser.id)');

    // Check updated source code
    expect(result.proposedSourceCode).toContain('import { UserCard } from');
    expect(result.proposedSourceCode).toContain('UserCard.jsx');
    expect(result.proposedSourceCode).toContain('<UserCard');
    expect(result.proposedSourceCode).toContain('selectedUser={selectedUser}');
    expect(result.proposedSourceCode).toContain('onDelete={handleDelete}');
    expect(result.proposedSourceCode).not.toContain('function UserCard()');
  });

  it('should support target path override via targetPathOverride option', async () => {
    const fixturePath = 'tests/fixtures/splitter/react-nested-component/input.jsx';
    const result = await createTransformationPlan({
      projectRoot,
      filePath: fixturePath,
      candidateId: 'user-card',
      targetPathOverride: 'tests/fixtures/splitter/custom-cards/MyUserCard.jsx',
      includePreview: true
    });

    expect(result.plan.targetFile).toBe('tests/fixtures/splitter/custom-cards/MyUserCard.jsx');
    expect(result.proposedSourceCode).toContain('import { UserCard } from');
    expect(result.proposedSourceCode).toContain('MyUserCard.jsx');
  });

  it('should throw CandidateNotFoundError when candidate ID is invalid', async () => {
    const fixturePath = 'tests/fixtures/splitter/react-nested-component/input.jsx';

    await expect(
      createTransformationPlan({
        projectRoot,
        filePath: fixturePath,
        candidateId: 'non-existent-candidate'
      })
    ).rejects.toThrow(CandidateNotFoundError);
  });

  it('should reject target path outside project root', async () => {
    const fixturePath = 'tests/fixtures/splitter/react-nested-component/input.jsx';

    await expect(
      createTransformationPlan({
        projectRoot,
        filePath: fixturePath,
        candidateId: 'user-card',
        targetPathOverride: '../../outside.jsx'
      })
    ).rejects.toThrow(TargetOutsideProjectError);
  });

  it('should preserve TypeScript syntax when extracting TypeScript components', async () => {
    const fixturePath = 'tests/fixtures/splitter/typescript-component/input.tsx';
    const result = await createTransformationPlan({
      projectRoot,
      filePath: fixturePath,
      candidateId: 'user-profile',
      includePreview: true
    });

    expect(result.plan).toBeDefined();
    expect(result.plan.candidate.symbol).toBe('UserProfile');
    expect(result.proposedTargetCode).toContain('export function UserProfile');
  });
});
