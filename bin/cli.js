#!/usr/bin/env node

/**
 * Main CLI executable entry point for ACR (Autonomous Code Reviewer).
 */

import fs from 'node:fs';
import { Command } from 'commander';
import { registerReviewCommand } from '../src/cli/commands/review.js';
import { registerInitCommand } from '../src/cli/commands/init.js';
import { registerCacheCommand } from '../src/cli/commands/cache.js';
import { registerDoctorCommand } from '../src/cli/commands/doctor.js';
import { registerSplitCommand } from '../src/cli/commands/split.js';
import { EXIT_CODES } from '../src/review/exit-codes.js';
import { printError } from '../src/cli/output/terminal.js';

const controller = new AbortController();

const onSignal = () => {
  process.exitCode = EXIT_CODES.INTERRUPTED;
  controller.abort();
};

process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

try {
  const pkgJsonUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgJsonUrl, 'utf-8'));

  const program = new Command();

  program
    .name('acr')
    .description('Production-quality, terminal-first JavaScript and React code reviewer powered by static analysis and AI')
    .version(pkg.version, '-v, --version', 'Output current version');

  registerReviewCommand(program, controller.signal);
  registerSplitCommand(program, controller.signal);
  registerInitCommand(program);
  registerCacheCommand(program);
  registerDoctorCommand(program);

  await program.parseAsync(process.argv);
} catch (error) {
  if (error && (error.name === 'AbortError' || controller.signal.aborted)) {
    process.exitCode = EXIT_CODES.INTERRUPTED;
  } else {
    const errorMessage = error instanceof Error ? error.message : String(error);
    printError(errorMessage);
    process.exitCode = EXIT_CODES.EXECUTION_ERROR;
  }
} finally {
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}
