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
      import { reviewRepository, EXIT_CODES, runDoctorChecks } from '@debdipbhat/acr';
      if (typeof reviewRepository !== 'function') throw new Error('reviewRepository is not a function');
      if (typeof runDoctorChecks !== 'function') throw new Error('runDoctorChecks is not a function');
      if (EXIT_CODES.SUCCESS !== 0) throw new Error('EXIT_CODES invalid');
      console.log('Programmatic API exports verified successfully.');
    `;
    await execFileAsync(nodeCmd, ['-e', testImportScript], {
      cwd: tempDir,
      windowsHide: true
    });
    console.log('[PASS] Programmatic API import passed.\n');

    // 5. Test CLI execution in consumer
    console.log('Step 5: Testing CLI executable...');
    const acrBin = path.join(tempDir, 'node_modules', '.bin', process.platform === 'win32' ? 'acr.cmd' : 'acr');
    const { stdout: cliVersionOut } = await execFileAsync(acrBin, ['--version'], {
      cwd: tempDir,
      windowsHide: true,
      shell: process.platform === 'win32'
    });
    console.log(`CLI version: ${cliVersionOut.trim()}`);
    console.log('[PASS] CLI binary invocation passed.\n');

    // 6. Test Doctor command in consumer
    console.log('Step 6: Testing "acr doctor" in consumer...');
    const { stdout: doctorOut } = await execFileAsync(acrBin, ['doctor', '--format', 'json'], {
      cwd: tempDir,
      windowsHide: true,
      shell: process.platform === 'win32'
    });
    const parsedDoctor = JSON.parse(doctorOut);
    if (!parsedDoctor.status) throw new Error('Doctor did not return valid JSON status');
    console.log(`Doctor status: ${parsedDoctor.status}`);
    console.log('[PASS] CLI doctor command passed.\n');

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
