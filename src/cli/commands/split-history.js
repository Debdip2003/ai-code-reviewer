/**
 * Split History Command Handler for ACR CLI.
 * Inspects past code split operations and their rollback availability.
 */

import { listOperationHistory, getOperationHistory } from '../../splitter/apply/operation-history.js';
import { printError } from '../output/terminal.js';
import { formatJsonOutput } from '../output/json.js';
import { printHistoryListReport, printHistoryDetailReport } from '../output/split-terminal.js';
import { SPLIT_EXIT_CODES, SplitError } from '../../splitter/split-errors.js';

/**
 * Action handler for "acr split history [operation-id]".
 *
 * @param {string | Object} [arg1]
 * @param {Object} [arg2={}]
 * @returns {Promise<void>}
 */
export async function splitHistoryAction(arg1, arg2 = {}) {
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

  try {
    if (operationId) {
      const detail = getOperationHistory({
        projectRoot: process.cwd(),
        operationId
      });

      if (outputFormat === 'json') {
        console.log(formatJsonOutput(detail));
      } else {
        printHistoryDetailReport(detail);
      }
    } else {
      const historyList = listOperationHistory({
        projectRoot: process.cwd()
      });

      if (outputFormat === 'json') {
        console.log(formatJsonOutput(historyList));
      } else {
        printHistoryListReport(historyList);
      }
    }

    process.exitCode = SPLIT_EXIT_CODES.SUCCESS;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const exitCode = error instanceof SplitError ? error.exitCode : SPLIT_EXIT_CODES.INVALID_USAGE;

    if (outputFormat === 'json') {
      console.log(
        formatJsonOutput({
          success: false,
          mode: 'history',
          error: {
            code: error.code || 'HISTORY_ERROR',
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
 * Registers the "history" subcommand on the split command.
 *
 * @param {import('commander').Command} splitCommand
 */
export function registerSplitHistoryCommand(splitCommand) {
  splitCommand
    .command('history [operation-id]')
    .description('List previous split operations or inspect a specific operation.')
    .option('-f, --format <format>', 'Output format (terminal or json)')
    .action(async (operationId, options, command) => {
      const parentOpts = command?.parent?.opts?.() || {};
      const mergedOptions = {
        ...parentOpts,
        ...(typeof options === 'object' && options !== null ? options : {})
      };
      await splitHistoryAction(operationId, mergedOptions);
    });
}
