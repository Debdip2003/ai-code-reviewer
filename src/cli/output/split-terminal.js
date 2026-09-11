/**
 * Split Planner Terminal Reporter.
 * Formats dry-run code-splitting plans for terminal display matching ACR V2 CLI design specs.
 */

import chalk from 'chalk';

/**
 * Formats a candidate kind into a human-readable title.
 * @param {string} kind
 * @returns {string}
 */
function formatCandidateType(kind) {
  switch (kind) {
    case 'react-component':
      return 'React component';
    case 'custom-hook':
      return 'Custom Hook';
    case 'service':
      return 'Service';
    case 'utility':
      return 'Utility';
    case 'constant-group':
      return 'Constant group';
    default:
      return kind;
  }
}

/**
 * Prints the split planner report to stdout.
 *
 * @param {Object} plan - Validated split plan object.
 */
export function printSplitTerminalReport(plan) {
  console.log(chalk.bold('ACR Split Planner\n'));
  console.log(`Source: ${plan.sourceFile}`);
  console.log(`Lines: ${plan.sourceSummary.lines}`);
  console.log(`Mode: ${plan.mode}\n`);

  const safeCandidates = plan.candidates.filter((c) => c.safeForFutureExtraction);
  const manualCandidates = plan.candidates.filter((c) => !c.safeForFutureExtraction);

  let candidateIndex = 1;

  if (safeCandidates.length > 0) {
    console.log(chalk.green.bold('Safe extraction candidates\n'));

    for (const cand of safeCandidates) {
      console.log(`${candidateIndex}. ${chalk.bold(cand.symbolName)}`);
      console.log(`   Type: ${formatCandidateType(cand.kind)}`);
      console.log(`   Lines: ${cand.lineStart}–${cand.lineEnd}`);
      console.log(`   Target: ${cand.targetFile}`);

      if (cand.dependencies.length > 0) {
        console.log(`   Dependencies: ${cand.dependencies.join(', ')}`);
      }
      if (cand.dependents.length > 0) {
        console.log(`   Used by: ${cand.dependents.join(', ')}`);
      }

      const confPct = Math.round(cand.confidence * 100);
      console.log(`   Confidence: ${confPct}%\n`);
      console.log('   Reason:');
      console.log(`   ${cand.reason}\n`);
      candidateIndex++;
    }
  }

  if (manualCandidates.length > 0) {
    console.log(chalk.yellow.bold('Candidates requiring manual review\n'));

    for (const cand of manualCandidates) {
      console.log(`${candidateIndex}. ${chalk.bold(cand.symbolName)}`);
      console.log(`   Type: ${formatCandidateType(cand.kind)}`);
      console.log(`   Lines: ${cand.lineStart}–${cand.lineEnd}`);
      console.log(`   Safe: ${chalk.red('No')}\n`);

      if (cand.risks && cand.risks.length > 0) {
        console.log('   Risks:');
        for (const risk of cand.risks) {
          console.log(`   - ${risk}`);
        }
        console.log('');
      }
      candidateIndex++;
    }
  }

  if (plan.warnings && plan.warnings.length > 0) {
    console.log(chalk.yellow.bold('Warnings:'));
    for (const warn of plan.warnings) {
      console.log(`  ⚠ ${warn}`);
    }
    console.log('');
  }

  console.log(chalk.bold('Summary\n'));
  console.log(`Candidates detected: ${plan.summary.detected}`);
  console.log(`Safe candidates: ${plan.summary.safe}`);
  console.log(`Manual review: ${plan.summary.unsafe}`);
  console.log(`Files modified: 0\n`);

  console.log(chalk.cyan('Dry run only. No source files were modified.'));
}
