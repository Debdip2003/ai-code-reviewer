/**
 * Split Planner Terminal Reporter for ACR Code Splitter.
 * Formats candidate discovery listings, transformation preview reports,
 * apply execution summaries, history logs, and rollback reports.
 */

import chalk from 'chalk';

/**
 * Formats a candidate kind into a human-readable title.
 * @param {string} kind
 * @returns {string}
 */
export function formatCandidateType(kind) {
  switch (kind) {
    case 'react-component':
      return 'React component';
    case 'custom-hook':
      return 'custom hook';
    case 'service':
      return 'service';
    case 'utility':
      return 'utility';
    case 'constant-group':
      return 'constant group';
    default:
      return kind;
  }
}

/**
 * Prints candidate discovery listing to stdout.
 *
 * @param {Object} plan - Split plan containing candidate list.
 */
export function printCandidateListingReport(plan) {
  const count = plan.candidates?.length || 0;
  console.log(`Split candidates found: ${count}\n`);

  if (count === 0) {
    console.log('No split candidates detected.\n');
    console.log('No files were modified.');
    return;
  }

  plan.candidates.forEach((cand, index) => {
    console.log(`${index + 1}. ${cand.id}`);
    console.log(`   Symbol: ${cand.symbolName}`);
    console.log(`   Type: ${formatCandidateType(cand.kind)}`);
    console.log(`   Lines: ${cand.lineStart}-${cand.lineEnd}`);
    console.log(`   Suggested target: ${cand.targetFile}`);
    console.log(`   Safety: ${cand.safety || (cand.safeForFutureExtraction ? 'automatic-ready' : 'manual-review')}\n`);
  });

  if (plan.warnings && plan.warnings.length > 0) {
    console.log(chalk.yellow.bold('Warnings:'));
    for (const warn of plan.warnings) {
      console.log(`  ⚠ ${warn}`);
    }
    console.log('');
  }

  console.log('No files were modified.');
}

/**
 * Prints transformation preview report to stdout.
 *
 * @param {Object} plan - Transformation plan matching TransformationPlanSchema.
 * @param {Object} [options={}]
 * @param {boolean} [options.showCodePreview=false]
 */
export function printTransformationPreviewReport(plan, { showCodePreview = false } = {}) {
  console.log(chalk.bold('ACR split preview\n'));
  console.log(`Source:    ${plan.sourceFile}`);
  console.log(`Candidate: ${plan.candidate.symbol} (${formatCandidateType(plan.candidate.kind)})`);
  console.log(`Target:    ${plan.targetFile}`);

  const safety = plan.candidate.safety;
  const safetyDisplay =
    safety === 'automatic-ready'
      ? chalk.green(safety)
      : safety === 'manual-review'
        ? chalk.yellow(safety)
        : chalk.red(safety);

  console.log(`Safety:    ${safetyDisplay}\n`);

  // Planned boundary
  console.log(chalk.bold('Planned boundary:'));

  // Props / Parameters
  const props = plan.contract.capturedBindings || [];
  if (props.length > 0) {
    console.log('  Props:');
    for (const p of props) {
      if (p.propName && p.propName !== p.name) {
        console.log(`    ${p.propName} <- ${p.name}`);
      } else {
        console.log(`    ${p.name}`);
      }
    }
    console.log('');
  }

  // Target imports
  const targetImports = plan.contract.imports || [];
  if (targetImports.length > 0) {
    console.log('  Target imports:');
    for (const imp of targetImports) {
      console.log(`    ${imp.imported.join(', ')} from ${imp.source}`);
    }
    console.log('');
  }

  // Moved declarations
  const moved = plan.contract.movedDependencies || [];
  if (moved.length > 0 || plan.candidate.symbol) {
    console.log('  Moved declarations:');
    console.log(`    ${plan.candidate.symbol}`);
    for (const m of moved) {
      console.log(`    ${m}`);
    }
    console.log('');
  }

  // Source imports
  console.log('  Source imports:');
  console.log(`    ${plan.candidate.symbol} from ${plan.targetFile.startsWith('.') ? plan.targetFile : './' + plan.targetFile}\n`);

  // Validation checks
  console.log(chalk.bold('Validation:'));
  const v = plan.validation;
  console.log(`  ${v.sourceParseable ? chalk.green('✓') : chalk.red('✗')} Proposed source parses`);
  console.log(`  ${v.targetParseable ? chalk.green('✓') : chalk.red('✗')} Proposed target parses`);
  console.log(`  ${v.unresolvedBindings.length === 0 ? chalk.green('✓') : chalk.red('✗')} All bindings resolved`);
  console.log(`  ${v.nameCollisions.length === 0 ? chalk.green('✓') : chalk.red('✗')} No naming collisions`);
  console.log(`  ${v.cycles.length === 0 ? chalk.green('✓') : chalk.red('✗')} No circular imports\n`);

  if (v.errors && v.errors.length > 0) {
    console.log(chalk.red.bold('Errors:'));
    for (const err of v.errors) {
      console.log(chalk.red(`  ✗ ${err}`));
    }
    console.log('');
  }

  if (v.warnings && v.warnings.length > 0) {
    console.log(chalk.yellow.bold('Warnings:'));
    for (const warn of v.warnings) {
      console.log(chalk.yellow(`  ⚠ ${warn}`));
    }
    console.log('');
  }

  // Code preview if requested
  if (showCodePreview && plan.preview) {
    const separator = '='.repeat(80);
    console.log(separator);
    console.log(`CREATE ${plan.targetFile}`);
    console.log(separator);
    console.log(plan.preview.target);
    console.log('\n' + separator);
    console.log(`UPDATE ${plan.sourceFile}`);
    console.log(separator);
    console.log(plan.preview.source);
    console.log('\n' + separator + '\n');
  }

  console.log('No files were modified.');
  if (!showCodePreview) {
    console.log('Run with --preview to display the proposed files.');
  }
}

/**
 * Prints apply transaction success report to stdout.
 *
 * @param {Object} result
 */
export function printApplySuccessReport(result) {
  console.log(chalk.green.bold('ACR split applied successfully\n'));
  console.log(`Operation: ${result.operationId}`);
  console.log(`Source:    ${result.sourceFile}`);
  console.log(`Candidate: ${result.candidate.symbol} (${result.candidate.id})`);
  console.log(`Target:    ${result.targetFile}\n`);

  console.log(chalk.bold('Changes:'));
  for (const f of result.files.updated) {
    console.log(`  UPDATE ${f}`);
  }
  for (const f of result.files.created) {
    console.log(`  CREATE ${f}`);
  }
  console.log('');

  console.log(chalk.bold('Validation:'));
  console.log(`  ${chalk.green('✓')} Pre-write checks passed`);
  console.log(`  ${chalk.green('✓')} Post-write AST validation passed\n`);

  console.log(chalk.bold('Backup:'));
  console.log(`  A persistent backup was saved in .acr/backups/${result.operationId}/\n`);

  console.log(chalk.bold('Rollback:'));
  console.log(`  To revert this operation, run:`);
  console.log(`  acr split rollback ${result.operationId}\n`);
}

/**
 * Prints split operation history list to stdout.
 *
 * @param {Array<Object>} operations
 */
export function printHistoryListReport(operations) {
  if (!operations || operations.length === 0) {
    console.log('No previous split operations found in history.\n');
    return;
  }

  console.log(chalk.bold('Split history\n'));

  for (const op of operations) {
    console.log(chalk.bold(op.operationId));
    console.log(`  Candidate: ${op.candidate?.symbol || 'unknown'} (${op.candidate?.id || 'unknown'})`);
    console.log(`  Source:    ${op.sourceFile}`);
    console.log(`  Target:    ${op.targetFile}`);
    const statusColor =
      op.status === 'completed'
        ? chalk.green
        : op.status === 'rolled-back'
          ? chalk.blue
          : chalk.yellow;
    console.log(`  Status:    ${statusColor(op.status)}`);
    console.log(`  Created:   ${op.createdAt}`);
    if (op.recoveryState) {
      console.log(`  Recovery:  ${chalk.yellow(op.recoveryState)}`);
    }
    console.log('');
  }
}

/**
 * Prints detailed history report for a single operation.
 *
 * @param {Object} manifest
 */
export function printHistoryDetailReport(manifest) {
  console.log(chalk.bold(`Operation Details: ${manifest.operationId}\n`));
  console.log(`Type:        ${manifest.type}`);
  console.log(`Status:      ${manifest.status}`);
  console.log(`Created:     ${manifest.createdAt}`);
  console.log(`Completed:   ${manifest.completedAt || 'pending'}`);
  console.log(`Source File: ${manifest.sourceFile}`);
  console.log(`Target File: ${manifest.targetFile}`);
  console.log(`Candidate:   ${manifest.candidate.symbol} (${manifest.candidate.id})\n`);

  console.log(chalk.bold('Hashes:'));
  console.log(`  Before source: ${manifest.before.sourceHash}`);
  if (manifest.after?.sourceHash) {
    console.log(`  After source:  ${manifest.after.sourceHash}`);
  }
  if (manifest.after?.targetHash) {
    console.log(`  After target:  ${manifest.after.targetHash}`);
  }
  console.log('');

  console.log(chalk.bold('Backups:'));
  for (const b of manifest.backupFiles) {
    console.log(`  ${b.originalPath} -> ${b.backupPath} (${b.hash.slice(0, 12)}...)`);
  }
  console.log('');

  console.log(chalk.bold('Rollback:'));
  console.log(`  Available: ${manifest.rollback.available}`);
  if (manifest.rollback.rolledBackAt) {
    console.log(`  Rolled back at: ${manifest.rollback.rolledBackAt}`);
  }
  console.log('');
}

/**
 * Prints rollback completion report to stdout.
 *
 * @param {Object} result
 */
export function printRollbackSuccessReport(result) {
  console.log(chalk.green.bold('ACR rollback completed\n'));
  console.log(`Operation: ${result.operationId}`);
  if (result.restored && result.restored.length > 0) {
    for (const f of result.restored) {
      console.log(`Restored:  ${f}`);
    }
  }
  if (result.removed && result.removed.length > 0) {
    for (const f of result.removed) {
      console.log(`Removed:   ${f}`);
    }
  }
  console.log('\nThe backup and operation manifest were retained.\n');
}

/**
 * Backward-compatible alias for printCandidateListingReport.
 */
export const printSplitTerminalReport = printCandidateListingReport;
