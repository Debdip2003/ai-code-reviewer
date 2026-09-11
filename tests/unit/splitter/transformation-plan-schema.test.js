import { describe, it, expect } from 'vitest';
import { TransformationPlanSchema } from '../../../src/splitter/transformation-plan-schema.js';

describe('Transformation Plan Schema', () => {
  it('should validate a complete valid transformation plan', () => {
    const validPlan = {
      version: 2,
      mode: 'preview',
      sourceFile: 'src/components/Dashboard.jsx',
      candidate: {
        id: 'user-card',
        symbol: 'UserCard',
        kind: 'react-component',
        safety: 'automatic-ready'
      },
      targetFile: 'src/components/UserCard.jsx',
      contract: {
        symbol: 'UserCard',
        kind: 'react-component',
        capturedBindings: [
          {
            name: 'selectedUser',
            usage: 'read',
            resolution: 'prop',
            propName: 'selectedUser'
          }
        ],
        imports: [
          {
            source: 'react',
            imported: ['useMemo'],
            type: 'named',
            isExternal: true
          }
        ],
        exports: [
          {
            name: 'UserCard',
            type: 'named'
          }
        ],
        movedDependencies: [],
        remainingDependencies: []
      },
      operations: [
        { type: 'create-file', path: 'src/components/UserCard.jsx' },
        { type: 'update-file', path: 'src/components/Dashboard.jsx' }
      ],
      validation: {
        sourceParseable: true,
        targetParseable: true,
        unresolvedBindings: [],
        nameCollisions: [],
        cycles: [],
        errors: [],
        warnings: []
      },
      filesModified: 0,
      preview: {
        source: 'export function Dashboard() {}',
        target: 'export function UserCard() {}'
      }
    };

    const parsed = TransformationPlanSchema.parse(validPlan);
    expect(parsed.version).toBe(2);
    expect(parsed.mode).toBe('preview');
    expect(parsed.filesModified).toBe(0);
  });

  it('should reject invalid version or mode', () => {
    const invalidPlan = {
      version: 1, // Invalid for transformation plan
      mode: 'apply',
      sourceFile: 'src/app.js',
      candidate: {
        id: 'app',
        symbol: 'App',
        kind: 'react-component',
        safety: 'automatic-ready'
      },
      targetFile: 'src/App.jsx',
      contract: {
        symbol: 'App',
        kind: 'react-component',
        capturedBindings: [],
        imports: [],
        exports: [{ name: 'App', type: 'named' }],
        movedDependencies: [],
        remainingDependencies: []
      },
      operations: [],
      validation: {
        sourceParseable: true,
        targetParseable: true,
        unresolvedBindings: [],
        nameCollisions: [],
        cycles: [],
        errors: [],
        warnings: []
      },
      filesModified: 0
    };

    expect(() => TransformationPlanSchema.parse(invalidPlan)).toThrow();
  });
});
