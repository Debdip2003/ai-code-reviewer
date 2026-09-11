import { describe, it, expect } from 'vitest';
import { calculateRelativeImportPath, planImports } from '../../../src/splitter/import-planner.js';

describe('Import Planner', () => {
  it('should calculate POSIX relative import paths correctly across directories', () => {
    expect(calculateRelativeImportPath('src/components/Dashboard.jsx', 'src/components/UserCard.jsx')).toBe('./UserCard.jsx');
    expect(calculateRelativeImportPath('src/components/Dashboard.jsx', 'src/utils/format-date.js')).toBe('../utils/format-date.js');
    expect(calculateRelativeImportPath('src/app/views/home/Home.jsx', 'src/services/api.js')).toBe('../../../services/api.js');
  });

  it('should plan target imports filtering only used specifiers', () => {
    const candidate = {
      symbolName: 'UserCard',
      dependencies: ['formatDate'],
      externalImports: ['useMemo']
    };

    const dependencyGraph = {
      imports: [
        {
          source: 'react',
          specifiers: [
            { local: 'useState', imported: 'useState', kind: 'named' },
            { local: 'useMemo', imported: 'useMemo', kind: 'named' }
          ]
        },
        {
          source: './utils.js',
          specifiers: [
            { local: 'formatDate', imported: 'formatDate', kind: 'named' },
            { local: 'formatNumber', imported: 'formatNumber', kind: 'named' }
          ]
        }
      ]
    };

    const result = planImports({
      sourceFile: 'src/components/Dashboard.jsx',
      targetFile: 'src/components/UserCard.jsx',
      candidate,
      movedDependencies: [],
      remainingDependencies: [],
      dependencyGraph
    });

    const reactImp = result.targetImports.find((i) => i.source === 'react');
    expect(reactImp).toBeDefined();
    expect(reactImp.specifiers.map((s) => s.local)).toEqual(['useMemo']);

    const utilsImp = result.targetImports.find((i) => i.source === './utils.js');
    expect(utilsImp).toBeDefined();
    expect(utilsImp.specifiers.map((s) => s.local)).toEqual(['formatDate']);

    expect(result.sourceNewImports).toEqual([
      {
        source: './UserCard.jsx',
        specifiers: [{ local: 'UserCard', imported: 'UserCard', kind: 'named' }],
        kind: 'named'
      }
    ]);
  });
});
