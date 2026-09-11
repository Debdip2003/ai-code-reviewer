/**
 * Split Command Handler for ACR CLI.
 * Supports candidate discovery, preview planning, safe application with backups,
 * history inspection, and manual rollback.
 */

import { loadConfig } from '../../config/load-config.js';
import { createSplitPlan } from '../../splitter/split-planner.js';
import { createTransformationPlan } from '../../splitter/transformation-planner.js';
import { applyTransformation } from '../../splitter/apply/apply-transformation.js';
import { createAIProvider } from '../../ai/provider.js';
import { printError } from '../output/terminal.js';
import { formatJsonOutput } from '../output/json.js';
import {
  printCandidateListingReport,
  printTransformationPreviewReport,
  printApplySuccessReport
} from '../output/split-terminal.js';
import { SPLIT_EXIT_CODES, SplitError } from '../../splitter/split-errors.js';
import { registerSplitHistoryCommand } from './split-history.js';
import { registerSplitRollbackCommand } from './split-rollback.js';

/**
 * Executes the split command action.
 *
 * @param {string} filePath - Path to the file to split.
 * @param {Object} [options={}] - Command options.
 * @param {'terminal' | 'json'} [options.format] - Output format.
 * @param {string} [options.candidate] - Selected candidate ID to extract.
 * @param {string} [options.target] - Target file path override.
 * @param {boolean} [options.preview] - Display proposed source and target file contents.
 * @param {boolean} [options.apply] - Apply the validated transformation.
 * @param {boolean} [options.yes] - Skip interactive confirmation.
 * @param {string} [options.targetDir] - Proposed target directory.
 * @param {string | number} [options.minLines] - Minimum lines threshold.
 * @param {boolean} [options.ai] - Enable AI-assisted planning.
 * @param {AbortSignal} [options.signal] - Cancellation signal.
 * @returns {Promise<void>}
 */
export async function splitAction(filePath, options = {}) {
  // Validate format option
  if (options.format !== undefined && !['terminal', 'json'].includes(options.format)) {
    printError(`Invalid format "${options.format}". Allowed formats are: terminal, json.`);
    process.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
    return;
  }

  // Validate --apply requirements
  if (options.apply && !options.candidate) {
    const errorMsg = 'Option --apply requires --candidate <id>.';
    if (options.format === 'json') {
      console.log(
        formatJsonOutput({
          success: false,
          mode: 'apply',
          error: {
            code: 'INVALID_CLI_USAGE',
            message: errorMsg
          },
          filesModified: false
        })
      );
    } else {
      printError(errorMsg);
    }
    process.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
    return;
  }

  // Validate minLines option
  let parsedMinLines;
  if (options.minLines !== undefined) {
    parsedMinLines = Number(options.minLines);
    if (!Number.isInteger(parsedMinLines) || parsedMinLines < 5 || parsedMinLines > 1000) {
      printError('Option --min-lines must be an integer between 5 and 1000.');
      process.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
      return;
    }
  }

  const cliOverrides = {
    splitter: {}
  };

  if (options.targetDir !== undefined) {
    cliOverrides.splitter.targetDirectory = options.targetDir;
  }
  if (parsedMinLines !== undefined) {
    cliOverrides.splitter.minCandidateLines = parsedMinLines;
  }
  if (options.ai !== undefined) {
    cliOverrides.splitter.aiPlanning = options.ai;
  }

  let config;
  try {
    config = await loadConfig({
      rootDirectory: process.cwd(),
      cliOverrides
    });
  } catch (configError) {
    printError(configError.message);
    process.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
    return;
  }

  const outputFormat = options.format || config.outputFormat || 'terminal';

  // Instantiate AI Provider if AI planning is enabled
  let aiProvider = null;
  if (config.splitter.aiPlanning) {
    try {
      aiProvider = createAIProvider({
        provider: config.ai?.provider || 'openai',
        timeoutMs: config.ai?.timeoutMs || 30000
      });
    } catch (providerError) {
      printError(`AI Provider initialization failed: ${providerError.message}`);
      process.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
      return;
    }
  }

  try {
    // -------------------------------------------------------------
    // Workflow A: Apply Transformation
    // -------------------------------------------------------------
    if (options.apply) {
      const applyResult = await applyTransformation({
        projectRoot: config.rootDirectory || process.cwd(),
        filePath,
        candidateId: options.candidate,
        targetPathOverride: options.target || null,
        yes: Boolean(options.yes),
        config,
        signal: options.signal
      });

      if (outputFormat === 'json') {
        console.log(formatJsonOutput(applyResult));
      } else {
        printApplySuccessReport(applyResult);
      }

      process.exitCode = SPLIT_EXIT_CODES.SUCCESS;
      return;
    }

    // -------------------------------------------------------------
    // Workflow B: Candidate Selected -> Transformation Preview Plan
    // -------------------------------------------------------------
    if (options.candidate) {
      const transformResult = await createTransformationPlan({
        projectRoot: config.rootDirectory || process.cwd(),
        filePath,
        candidateId: options.candidate,
        targetPathOverride: options.target || null,
        includePreview: Boolean(options.preview),
        config,
        signal: options.signal
      });

      const plan = transformResult.plan;

      if (outputFormat === 'json') {
        console.log(formatJsonOutput(plan));
      } else {
        printTransformationPreviewReport(plan, {
          showCodePreview: Boolean(options.preview)
        });
      }

      if (plan.candidate.safety === 'blocked') {
        process.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
      } else if (plan.candidate.safety === 'manual-review') {
        process.exitCode = 1;
      } else {
        process.exitCode = SPLIT_EXIT_CODES.SUCCESS;
      }
      return;
    }

    // -------------------------------------------------------------
    // Workflow C: Candidate Discovery Listing
    // -------------------------------------------------------------
    const result = await createSplitPlan({
      projectRoot: config.rootDirectory || process.cwd(),
      filePath,
      config,
      aiProvider,
      signal: options.signal
    });

    const plan = result.plan;

    if (outputFormat === 'json') {
      const jsonPayload = {
        ...plan,
        filesModified: 0
      };
      console.log(formatJsonOutput(jsonPayload));
    } else {
      printCandidateListingReport(plan);
    }

    // Exit code determination:
    if (plan.summary.unsafe > 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = SPLIT_EXIT_CODES.SUCCESS;
    }
  } catch (error) {
    if (error && (error.name === 'AbortError' || options.signal?.aborted)) {
      process.exitCode = SPLIT_EXIT_CODES.INTERRUPTED;
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const exitCode = error instanceof SplitError ? error.exitCode : SPLIT_EXIT_CODES.INVALID_USAGE;

    if (outputFormat === 'json') {
      const mode = options.apply ? 'apply' : (options.candidate ? 'preview' : 'discover');
      console.log(
        formatJsonOutput({
          success: false,
          mode,
          error: {
            code: error.code || 'SPLIT_ERROR',
            message: errorMessage
          },
          filesModified: false
        })
      );
    } else {
      printError(errorMessage);
    }

    process.exitCode = exitCode;
  }
}

/**
 * Registers the 'split' command on a Commander program instance.
 *
 * @param {import('commander').Command} program - Commander program instance.
 * @param {AbortSignal} [signal] - Optional cancellation signal.
 */
export function registerSplitCommand(program, signal) {
  const splitCmd = program
    .command('split [file]')
    .description('Analyze a JavaScript or React file and propose an exact code split preview without modifying source code.')
    .option('-f, --format <format>', 'Output format (terminal or json)')
    .option('--candidate <id>', 'Candidate to extract')
    .option('--target <path>', 'Override the suggested target path')
    .option('--preview', 'Show proposed source and target file contents')
    .option('--apply', 'Apply the validated transformation')
    .option('-y, --yes', 'Skip interactive confirmation')
    .option('--target-dir <dir>', 'Target directory for proposed split files')
    .option('--min-lines <number>', 'Minimum candidate line count')
    .option('--ai', 'Use Groq/OpenAI to improve naming and explanations')
    .option('--no-ai', 'Disable AI')
    .action(async (file, options) => {
      if (!file) {
        splitCmd.outputHelp();
        process.exitCode = SPLIT_EXIT_CODES.INVALID_USAGE;
        return;
      }
      await splitAction(file, { ...options, signal });
    });

  // Register history subcommand
  registerSplitHistoryCommand(splitCmd);

  // Register rollback subcommand
  registerSplitRollbackCommand(splitCmd, signal);
}
