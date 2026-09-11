/**
 * Apply Transformation Orchestrator for ACR Code Splitter.
 * Coordinates transformation planning, interactive confirmation, locking, and transactional file application.
 */

import path from 'node:path';
import readline from 'node:readline';
import { createTransformationPlan } from '../transformation-planner.js';
import { generateOperationId } from './write-utils.js';
import { acquireLock, releaseLock } from './change-lock.js';
import { executeFileTransaction } from './file-transaction.js';
import {
  ApplyNotAllowedError,
  ConfirmationRequiredError,
  OperationCancelledError
} from '../split-errors.js';

/**
 * Prompts the user for interactive confirmation via CLI stdin.
 *
 * @param {string} promptText
 * @returns {Promise<boolean>}
 */
async function promptConfirmation(promptText) {
  if (!process.stdin.isTTY) {
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

/**
 * Safely applies an extraction candidate split to disk with backups and transaction guarantees.
 *
 * @param {Object} params
 * @param {string} [params.projectRoot=process.cwd()] - Project root path.
 * @param {string} params.filePath - Source file path to split.
 * @param {string} params.candidateId - Candidate identifier to extract.
 * @param {string} [params.targetPathOverride] - Custom target path override.
 * @param {boolean} [params.yes=false] - Skip interactive confirmation.
 * @param {Object} [params.config={}] - Reviewer / splitter configuration.
 * @param {AbortSignal} [params.signal] - Cancellation signal.
 * @param {Object} [params._hooks={}] - Optional test hooks for failure injection.
 * @returns {Promise<Object>} The completed apply transaction report.
 */
export async function applyTransformation({
  projectRoot = process.cwd(),
  filePath,
  candidateId,
  targetPathOverride = null,
  yes = false,
  config = {},
  signal = null,
  _hooks = {}
}) {
  const absProjectRoot = path.resolve(projectRoot);

  // 1. Generate the transformation plan and proposed code
  const transformResult = await createTransformationPlan({
    projectRoot: absProjectRoot,
    filePath,
    candidateId,
    targetPathOverride,
    includePreview: true,
    config,
    signal
  });

  const { plan, proposedSourceCode, proposedTargetCode } = transformResult;

  // 2. Strict safety verification
  if (plan.candidate.safety !== 'automatic-ready') {
    const reasons = [];
    if (plan.validation?.errors?.length > 0) {
      reasons.push(...plan.validation.errors);
    }
    if (plan.validation?.unresolvedBindings?.length > 0) {
      reasons.push(`Unresolved bindings: ${plan.validation.unresolvedBindings.join(', ')}`);
    }
    if (plan.candidate.safety === 'manual-review') {
      reasons.push('Candidate requires manual review before extraction.');
    } else if (plan.candidate.safety === 'blocked') {
      reasons.push('Candidate extraction is blocked by safety invariants.');
    }

    throw new ApplyNotAllowedError(
      `Cannot apply split for candidate "${plan.candidate.id}" (safety: ${plan.candidate.safety}).\n` +
        `Only "automatic-ready" candidates can be applied automatically.\n` +
        reasons.map((r) => `  - ${r}`).join('\n'),
      {
        candidateId: plan.candidate.id,
        safety: plan.candidate.safety,
        reasons
      }
    );
  }

  // 3. User Confirmation Prompt
  if (!yes) {
    if (!process.stdin.isTTY) {
      throw new ConfirmationRequiredError(
        'User confirmation required. Pass --yes to apply non-interactively.'
      );
    }

    const promptText =
      `\nACR will apply the following split:\n\n` +
      `Source:    ${plan.sourceFile}\n` +
      `Candidate: ${plan.candidate.symbol}\n` +
      `Target:    ${plan.targetFile}\n\n` +
      `Changes:\n` +
      `  UPDATE ${plan.sourceFile}\n` +
      `  CREATE ${plan.targetFile}\n\n` +
      `Backup:\n` +
      `  A persistent backup will be created in .acr/backups/\n\n` +
      `Continue? (y/N) `;

    const confirmed = await promptConfirmation(promptText);
    if (!confirmed) {
      throw new OperationCancelledError('Operation cancelled by user.');
    }
  }

  if (signal?.aborted) {
    const abortErr = new Error('Apply operation aborted.');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // 4. Generate Operation ID and Acquire Lock
  const operationId = generateOperationId();
  acquireLock({ projectRoot: absProjectRoot, operationId });

  try {
    // 5. Execute Multi-File Transaction
    const result = await executeFileTransaction({
      projectRoot: absProjectRoot,
      operationId,
      plan,
      proposedSourceCode,
      proposedTargetCode,
      _hooks
    });

    return result;
  } finally {
    releaseLock({ projectRoot: absProjectRoot, operationId });
  }
}
