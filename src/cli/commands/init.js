/**
 * Init command handler.
 * CLI command responsible for bootstrapping configuration files in target repositories.
 */

import { printInfo, printWarning } from '../output/terminal.js';

/**
 * Executes the init command action.
 * @returns {Promise<void>}
 */
export async function initAction() {
  printInfo(`Initializing ai-code-reviewer configuration...`);
  printWarning(`[Scaffolding Note] Interactive configuration initialization will be implemented in a future release.`);
}

/**
 * Registers the 'init' command on a Commander program instance.
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerInitCommand(program) {
  program
    .command('init')
    .description('Initialize default ai-code-reviewer configuration in the current repository')
    .action(initAction);
}
