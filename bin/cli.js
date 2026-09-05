#!/usr/bin/env node

/**
 * Main CLI executable entry point for ai-code-reviewer.
 */

import fs from 'node:fs';
import { Command } from 'commander';
import { registerReviewCommand } from '../src/cli/commands/review.js';
import { registerInitCommand } from '../src/cli/commands/init.js';
import { registerCacheCommand } from '../src/cli/commands/cache.js';
import { printError } from '../src/cli/output/terminal.js';

try {
  const pkgJsonUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgJsonUrl, 'utf-8'));

  const program = new Command();

  program
    .name('ai-code-reviewer')
    .description('Production-quality, terminal-first JavaScript and React code reviewer powered by static analysis and AI')
    .version(pkg.version, '-v, --version', 'Output current version');

  registerReviewCommand(program);
  registerInitCommand(program);
  registerCacheCommand(program);

  await program.parseAsync(process.argv);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  printError(errorMessage);
  process.exit(1);
}
