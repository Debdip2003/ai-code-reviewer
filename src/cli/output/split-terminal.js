/**
 * Split Planner Terminal Reporter for ACR Code Splitter.
 * Formats candidate discovery listings and transformation preview reports.
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
 * Backward-compatible alias for printCandidateListingReport.
 */
export const printSplitTerminalReport = printCandidateListingReport;
