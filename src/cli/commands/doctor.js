/**
 * Doctor diagnostics command handler.
 * Performs read-only environment, toolchain, configuration, and security sanity checks for ACR.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { loadConfig, ConfigurationError } from '../../config/load-config.js';
import { findGitRoot, GitDiffError } from '../../scanner/git-diff.js';
import { CONFIG_FILE_NAME } from '../../config/defaults.js';
import { EXIT_CODES } from '../../review/exit-codes.js';
import { formatJsonOutput } from '../output/json.js';
import { printError } from '../output/terminal.js';

const execFileAsync = promisify(execFile);

/**
 * Runs all diagnostics checks for the environment and configuration.
 *
 * @param {string} [targetPath='.']
 * @returns {Promise<{
 *   ok: boolean,
 *   nodeVersion: string,
 *   nodeSupported: boolean,
 *   packageVersion: string,
 *   rootDirectory: string,
 *   rootValid: boolean,
 *   configValid: boolean,
 *   configPresent: boolean,
 *   configError: string | null,
 *   gitAvailable: boolean,
 *   gitVersion: string | null,
 *   gitRepoDetected: boolean,
 *   gitRoot: string | null,
 *   cachePathSafe: boolean,
 *   cacheDirectory: string,
 *   aiEnabled: boolean,
 *   apiKeyConfigured: boolean,
 *   checks: Array<{ name: string, status: 'pass' | 'fail' | 'info', message: string }>
 * }>}
 */
export async function runDoctorChecks(targetPath = '.') {
  const resolvedRoot = path.resolve(targetPath);
  const checks = [];
  let overallOk = true;

  // 1. Node.js version
  const currentNodeVersion = process.version;
  const majorVersion = parseInt(process.versions.node.split('.')[0], 10);
  const nodeSupported = majorVersion >= 20;

  if (nodeSupported) {
    checks.push({ name: 'Node.js', status: 'pass', message: `Node.js ${currentNodeVersion}` });
  } else {
    overallOk = false;
    checks.push({
      name: 'Node.js',
      status: 'fail',
      message: `Node.js ${currentNodeVersion} is unsupported (requires Node.js >= 20)`
    });
  }

  // 2. Package version
  let packageVersion = '0.1.0';
  try {
    const pkgUrl = new URL('../../../package.json', import.meta.url);
    const rawPkg = await fs.readFile(pkgUrl, 'utf-8');
    const parsedPkg = JSON.parse(rawPkg);
    packageVersion = parsedPkg.version || '0.1.0';
    checks.push({ name: 'ACR Version', status: 'pass', message: `ACR v${packageVersion}` });
  } catch {
    checks.push({ name: 'ACR Version', status: 'pass', message: `ACR v${packageVersion}` });
  }

  // 3. Root directory validity
  let rootValid = false;
  try {
    const stat = await fs.stat(resolvedRoot);
    if (stat.isDirectory()) {
      rootValid = true;
      checks.push({ name: 'Root Directory', status: 'pass', message: `Directory valid: ${resolvedRoot}` });
    } else {
      overallOk = false;
      checks.push({ name: 'Root Directory', status: 'fail', message: `Path is not a directory: ${resolvedRoot}` });
    }
  } catch (err) {
    overallOk = false;
    checks.push({ name: 'Root Directory', status: 'fail', message: `Directory inaccessible: ${err.message}` });
  }

  // 4. Configuration file validity
  let configValid = true;
  let configPresent = false;
  let configError = null;
  let loadedConfig = null;

  try {
    const configPath = path.join(resolvedRoot, CONFIG_FILE_NAME);
    try {
      await fs.access(configPath);
      configPresent = true;
    } catch {
      configPresent = false;
    }

    loadedConfig = await loadConfig({ rootDirectory: resolvedRoot });
    if (configPresent) {
      checks.push({ name: 'Configuration', status: 'pass', message: `Configuration valid (${CONFIG_FILE_NAME})` });
    } else {
      checks.push({ name: 'Configuration', status: 'pass', message: 'Default configuration active (no .acrrc.json)' });
    }
  } catch (err) {
    configValid = false;
    overallOk = false;
    configError = err instanceof Error ? err.message : String(err);
    checks.push({ name: 'Configuration', status: 'fail', message: `Configuration invalid: ${configError}` });
  }

  // 5. Git availability
  let gitAvailable = false;
  let gitVersion = null;
  try {
    const { stdout } = await execFileAsync('git', ['--version'], { windowsHide: true });
    gitAvailable = true;
    gitVersion = stdout.trim();
    checks.push({ name: 'Git Executable', status: 'pass', message: `Git available (${gitVersion})` });
  } catch {
    // Git not available is a failure if repository check is needed
    checks.push({ name: 'Git Executable', status: 'fail', message: 'Git executable not found on system PATH' });
  }

  // 6. Git repository detection
  let gitRepoDetected = false;
  let gitRoot = null;
  if (gitAvailable) {
    try {
      gitRoot = await findGitRoot(resolvedRoot);
      gitRepoDetected = true;
      checks.push({ name: 'Git Repository', status: 'pass', message: `Git repository detected (${gitRoot})` });
    } catch {
      checks.push({ name: 'Git Repository', status: 'info', message: 'Not inside a Git repository' });
    }
  }

  // 7. Cache directory path safety
  let cachePathSafe = true;
  const configuredCacheDir = loadedConfig?.cache?.directory || '.acr-cache';
  if (path.isAbsolute(configuredCacheDir) || configuredCacheDir.split(/[/\\]/).includes('..')) {
    cachePathSafe = false;
    overallOk = false;
    checks.push({ name: 'Cache Directory', status: 'fail', message: `Cache path unsafe: "${configuredCacheDir}"` });
  } else {
    checks.push({ name: 'Cache Directory', status: 'pass', message: `Cache path safe (${configuredCacheDir})` });
  }

  // 8. AI Status & Key Configuration (Strictly reporting presence, never key content)
  const isAiEnabled = Boolean(loadedConfig?.ai?.enabled);
  const apiKeyPresent = Boolean(
    (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) ||
    (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0)
  );

  if (isAiEnabled) {
    checks.push({ name: 'AI Review', status: 'pass', message: 'AI review: enabled' });
    if (apiKeyPresent) {
      checks.push({ name: 'API Key', status: 'pass', message: 'OPENAI_API_KEY: configured' });
    } else {
      overallOk = false;
      checks.push({ name: 'API Key', status: 'fail', message: 'OPENAI_API_KEY: not configured (required when AI is enabled)' });
    }
  } else {
    checks.push({ name: 'AI Review', status: 'info', message: 'AI review: disabled' });
    if (apiKeyPresent) {
      checks.push({ name: 'API Key', status: 'info', message: 'OPENAI_API_KEY: configured' });
    } else {
      checks.push({ name: 'API Key', status: 'info', message: 'OPENAI_API_KEY: not configured' });
    }
  }

  return {
    ok: overallOk,
    nodeVersion: currentNodeVersion,
    nodeSupported,
    packageVersion,
    rootDirectory: resolvedRoot,
    rootValid,
    configValid,
    configPresent,
    configError,
    gitAvailable,
    gitVersion,
    gitRepoDetected,
    gitRoot,
    cachePathSafe,
    cacheDirectory: configuredCacheDir,
    aiEnabled: isAiEnabled,
    apiKeyConfigured: apiKeyPresent,
    checks
  };
}

/**
 * Action handler for `acr doctor [path]`.
 *
 * @param {string} [targetPath='.']
 * @param {Object} [options={}]
 * @param {'terminal' | 'json'} [options.format='terminal']
 * @returns {Promise<void>}
 */
export async function doctorAction(targetPath = '.', options = {}) {
  // Validate format
  if (options.format !== undefined && !['terminal', 'json'].includes(options.format)) {
    printError(`Invalid format "${options.format}". Allowed formats are: terminal, json.`);
    process.exitCode = EXIT_CODES.EXECUTION_ERROR;
    return;
  }

  try {
    const report = await runDoctorChecks(targetPath);

    if (options.format === 'json') {
      console.log(formatJsonOutput({
        status: report.ok ? 'doctor-pass' : 'doctor-fail',
        ...report
      }));
    } else {
      console.log(`${chalk.bold('ACR Doctor')}\n`);
      for (const check of report.checks) {
        if (check.status === 'pass') {
          console.log(`${chalk.green('✓')} ${check.message}`);
        } else if (check.status === 'fail') {
          console.log(`${chalk.red('✖')} ${chalk.red(check.message)}`);
        } else {
          console.log(`${chalk.cyan('○')} ${chalk.dim(check.message)}`);
        }
      }

      console.log('');
      if (report.ok) {
        console.log(chalk.green.bold('Environment is ready for deterministic review.'));
      } else {
        console.log(chalk.red.bold('One or more required doctor checks failed.'));
      }
    }

    process.exitCode = report.ok ? EXIT_CODES.SUCCESS : EXIT_CODES.EXECUTION_ERROR;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printError(msg);
    process.exitCode = EXIT_CODES.EXECUTION_ERROR;
  }
}

/**
 * Registers doctor command on Commander program.
 * @param {import('commander').Command} program
 */
export function registerDoctorCommand(program) {
  program
    .command('doctor')
    .description('Run environment, toolchain, and configuration diagnostics')
    .argument('[path]', 'Path to project directory', '.')
    .option('-f, --format <format>', 'Output format (terminal or json)')
    .action(async (targetPath = '.', options) => {
      await doctorAction(targetPath, options);
    });
}
