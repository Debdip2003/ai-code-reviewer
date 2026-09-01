/**
 * Review command handler.
 * CLI command responsible for initiating static and AI-assisted reviews of codebases.
 */

import path from 'node:path';
import { printInfo, printWarning } from '../output/terminal.js';

/**
 * Executes the review command action.
 * @param {string} [targetPath='.'] - Target file or repository path to review.
 * @param {Object} [options={}] - Command options.
 * @param {'terminal' | 'json'} [options.format='terminal'] - Output format.
 * @param {boolean} [options.changed=false] - Whether to review only changed files.
 * @returns {Promise<void>}
 */
export async function reviewAction(targetPath = '.', options = {}) {
  const resolvedPath = path.resolve(process.cwd(), targetPath);
  const format = options.format || 'terminal';
  const changedOnly = Boolean(options.changed);

  printInfo(`Review command received:`);
  printInfo(`  Target path:   ${resolvedPath}`);
  printInfo(`  Output format: ${format}`);
  printInfo(`  Changed only:  ${changedOnly}`);
  printWarning(`[Scaffolding Note] File scanning and review engine execution are not yet implemented.`);
}

/**
 * Registers the 'review' command on a Commander program instance.
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerReviewCommand(program) {
  program
    .command('review')
    .description('Review JavaScript and React files in a directory or repository')
    .argument('[path]', 'Path to the directory or file to review', '.')
    .option('-f, --format <format>', 'Output format (terminal or json)', 'terminal')
    .option('--changed', 'Review only git-changed files', false)
    .action(reviewAction);
}
