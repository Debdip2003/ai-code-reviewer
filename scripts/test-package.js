#!/usr/bin/env node

/**
 * Packed tarball consumer smoke test for ACR (@debdipbhat/acr).
 * Packs the project into a tarball, installs it into an isolated temporary workspace,
 * verifies CLI execution and programmatic ESM imports, and cleans up artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(process.cwd());

async function run() {
  console.log('--- ACR Package Smoke Test ---\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-smoke-'));
  let tarballPath = null;

  try {
    // 1. Pack tarball
    console.log('Step 1: Running npm pack...');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const { stdout: packOutput } = await execFileAsync(npmCmd, ['pack'], {
      cwd: projectRoot,
      windowsHide: true,
      shell: process.platform === 'win32'
    });

    const tarballFileName = packOutput.trim().split(/\r?\n/).pop().trim();
    tarballPath = path.join(projectRoot, tarballFileName);
    console.log(`Created tarball: ${tarballPath}\n`);

    // 2. Initialize consumer project
    console.log('Step 2: Initializing temporary consumer workspace...');
    const consumerPkg = {
      name: 'acr-consumer-smoke-test',
      version: '1.0.0',
      type: 'module',
      private: true
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(consumerPkg, null, 2));

    // 3. Install packed tarball
    console.log(`Step 3: Installing ${tarballFileName} in consumer workspace...`);
    await execFileAsync(npmCmd, ['install', tarballPath, '--no-audit', '--no-fund'], {
      cwd: tempDir,
      windowsHide: true,
      shell: process.platform === 'win32'
    });
    console.log('Installation succeeded.\n');

    // 4. Test programmatic ESM import
    console.log('Step 4: Testing programmatic ESM exports...');
    const nodeCmd = process.execPath;
    const testImportScript = `
      import {
        reviewRepository,
        EXIT_CODES,
        runDoctorChecks,
        createSplitPlan,
        createTransformationPlan,
        applyTransformation,
        rollbackOperation,
        SPLIT_EXIT_CODES,
        SplitPlanSchema,
        TransformationPlanSchema,
        OperationManifestSchema
      } from '@debdipbhat/acr';

      if (typeof reviewRepository !== 'function') throw new Error('reviewRepository is not a function');
      if (typeof runDoctorChecks !== 'function') throw new Error('runDoctorChecks is not a function');
      if (typeof createSplitPlan !== 'function') throw new Error('createSplitPlan is not a function');
      if (typeof createTransformationPlan !== 'function') throw new Error('createTransformationPlan is not a function');
      if (typeof applyTransformation !== 'function') throw new Error('applyTransformation is not a function');
      if (typeof rollbackOperation !== 'function') throw new Error('rollbackOperation is not a function');
      if (EXIT_CODES.SUCCESS !== 0) throw new Error('EXIT_CODES invalid');
      if (SPLIT_EXIT_CODES.SUCCESS !== 0) throw new Error('SPLIT_EXIT_CODES invalid');
      if (!SplitPlanSchema || !TransformationPlanSchema || !OperationManifestSchema) {
        throw new Error('Zod schemas not exported');
      }
      console.log('Programmatic API exports verified successfully.');
    `;
    const testScriptPath = path.join(tempDir, 'test-import.js');
    fs.writeFileSync(testScriptPath, testImportScript, 'utf-8');

    const { stdout: importStdout } = await execFileAsync(nodeCmd, ['test-import.js'], {
      cwd: tempDir,
      windowsHide: true
    });
    console.log(importStdout.trim());
    console.log('[PASS] Programmatic API import passed.\n');

    // 5. Test CLI execution in consumer
    console.log('Step 5: Testing CLI executable...');
    const cliPath = path.join(tempDir, 'node_modules', '@debdipbhat', 'acr', 'bin', 'cli.js');
    const { stdout: cliVersionOut } = await execFileAsync(nodeCmd, [cliPath, '--version'], {
      cwd: tempDir,
      windowsHide: true
    });
    console.log(`CLI version: ${cliVersionOut.trim()}`);
    console.log('[PASS] CLI binary invocation passed.\n');

    // 6. Test Doctor & Split commands in consumer
    console.log('Step 6: Testing "acr doctor" & "acr split --help" in consumer...');
    const { stdout: doctorOut } = await execFileAsync(nodeCmd, [cliPath, 'doctor', '--format', 'json'], {
      cwd: tempDir,
      windowsHide: true
    });
    const parsedDoctor = JSON.parse(doctorOut);
    if (!parsedDoctor.status) throw new Error('Doctor did not return valid JSON status');
    console.log(`Doctor status: ${parsedDoctor.status}`);

    const { stdout: splitHelpOut } = await execFileAsync(nodeCmd, [cliPath, 'split', '--help'], {
      cwd: tempDir,
      windowsHide: true
    });
    if (!splitHelpOut.includes('candidate') || !splitHelpOut.includes('apply')) {
      throw new Error('Split help output missing expected options');
    }
    console.log('[PASS] CLI doctor & split commands passed.\n');

    console.log('[SUCCESS] All package consumer smoke tests passed.');
    process.exitCode = 0;
  } catch (err) {
    console.error('[FAIL] Package smoke test failed:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      if (tarballPath && fs.existsSync(tarballPath)) {
        fs.unlinkSync(tarballPath);
      }
    } catch (cleanupErr) {
      console.warn('Warning during cleanup:', cleanupErr.message);
    }
  }
}

run();
