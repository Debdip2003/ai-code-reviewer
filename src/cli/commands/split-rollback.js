/**
 * Split Rollback Command Handler for ACR CLI.
 * Reverts an applied code split operation to its previous state using verified backups.
 */

import { rollbackOperation } from '../../splitter/apply/rollback-operation.js';
import { printError } from '../output/terminal.js';
import { formatJsonOutput } from '../output/json.js';
import { printRollbackSuccessReport } from '../output/split-terminal.js';
import { SPLIT_EXIT_CODES, SplitError } from '../../splitter/split-errors.js';

/**
 * Action handler for "acr split rollback <operation-id>".
 *
 * @param {string | Object} arg1
 * @param {Object} [arg2={}]
 * @returns {Promise<void>}
 */
export async function splitRollbackAction(arg1, arg2 = {}) {
  let operationId = null;
  let options = {};

  if (typeof arg1 === 'string') {
    operationId = arg1;
    options = typeof arg2 === 'object' && arg2 !== null ? arg2 : {};
  } else if (typeof arg1 === 'object' && arg1 !== null) {
    options = arg1;
  } else if (typeof arg2 === 'object' && arg2 !== null) {
    options = arg2;
  }

  const outputFormat = options.format || 'terminal';
  const yes = Boolean(options.yes);

  try {
    const result = await rollbackOperation({
      projectRoot: process.cwd(),
      operationId,
      yes,
      signal: options.signal
    });

    if (outputFormat === 'json') {
      console.log(formatJsonOutput(result));
    } else {
      printRollbackSuccessReport(result);
    }

    process.exitCode = SPLIT_EXIT_CODES.SUCCESS;
  } catch (error) {
    if (error && (error.name === 'AbortError' || options.signal?.aborted)) {
      process.exitCode = SPLIT_EXIT_CODES.INTERRUPTED;
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const exitCode = error instanceof SplitError ? error.exitCode : SPLIT_EXIT_CODES.INTERNAL_FAILURE;

    if (outputFormat === 'json') {
      console.log(
        formatJsonOutput({
          success: false,
          mode: 'rollback',
          operationId,
          error: {
            code: error.code || 'ROLLBACK_ERROR',
            message: errorMessage
          }
        })
      );
    } else {
      printError(errorMessage);
    }

    process.exitCode = exitCode;
  }
}

/**
 * Registers the "rollback" subcommand on the split command.
 *
 * @param {import('commander').Command} splitCommand
 * @param {AbortSignal} [signal]
 */
export function registerSplitRollbackCommand(splitCommand, signal) {
  splitCommand
    .command('rollback <operation-id>')
    .description('Revert an applied code split operation.')
    .option('-y, --yes', 'Skip interactive confirmation')
    .option('-f, --format <format>', 'Output format (terminal or json)')
    .action(async (operationId, options, command) => {
      const parentOpts = command?.parent?.opts?.() || {};
      const mergedOptions = {
        ...parentOpts,
        ...(typeof options === 'object' && options !== null ? options : {}),
        signal
      };
      await splitRollbackAction(operationId, mergedOptions);
    });
}
