#!/usr/bin/env node

/**
 * Pre-release validation script for ACR (@code/acr).
 * Validates package metadata, file manifests, binary configurations, and release readiness.
 */

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
let failures = 0;

function pass(name, details = '') {
  console.log(`[PASS] ${name}${details ? ` - ${details}` : ''}`);
}

function fail(name, reason) {
  console.error(`[FAIL] ${name} - ${reason}`);
  failures++;
}

console.log('--- ACR Pre-Release Validation ---\n');

// 1. package.json validation
let pkg;
try {
  const pkgPath = path.join(projectRoot, 'package.json');
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pass('package.json exists and is valid JSON');
} catch (err) {
  fail('package.json parsing', err.message);
  process.exit(1);
}

// 2. Name check
if (pkg.name === '@code/acr') {
  pass('Package name', pkg.name);
} else {
  fail('Package name', `Expected "@code/acr", found "${pkg.name}"`);
}

// 3. Bin mapping
if (pkg.bin && pkg.bin.acr === './bin/cli.js') {
  pass('Bin mapping', 'acr -> ./bin/cli.js');
} else {
  fail('Bin mapping', `Expected { acr: "./bin/cli.js" }, found ${JSON.stringify(pkg.bin)}`);
}

// 4. Module type & main
if (pkg.type === 'module') {
  pass('Package type', 'module');
} else {
  fail('Package type', `Expected "module", found "${pkg.type}"`);
}

if (pkg.main === 'src/index.js') {
  pass('Package main', 'src/index.js');
} else {
  fail('Package main', `Expected "src/index.js", found "${pkg.main}"`);
}

// 5. Engine requirements
if (pkg.engines && pkg.engines.node && pkg.engines.node.includes('>=20')) {
  pass('Node engine requirement', pkg.engines.node);
} else {
  fail('Node engine requirement', 'Expected node >= 20 in engines');
}

// 6. Required release files presence
const requiredFiles = ['bin/cli.js', 'src/index.js', 'README.md', 'LICENSE', 'CHANGELOG.md'];
for (const relFile of requiredFiles) {
  const fullPath = path.join(projectRoot, relFile);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.size > 0) {
      pass(`Required file: ${relFile}`, `${stat.size} bytes`);
    } else {
      fail(`Required file: ${relFile}`, 'File is empty');
    }
  } else {
    fail(`Required file: ${relFile}`, 'File does not exist');
  }
}

// 7. Shebang check on CLI binary
try {
  const cliContent = fs.readFileSync(path.join(projectRoot, 'bin/cli.js'), 'utf-8');
  if (cliContent.startsWith('#!/usr/bin/env node')) {
    pass('CLI binary shebang', '#!/usr/bin/env node');
  } else {
    fail('CLI binary shebang', 'Missing #!/usr/bin/env node at top of bin/cli.js');
  }
} catch (err) {
  fail('CLI binary shebang check', err.message);
}

// 8. Package files whitelist check
if (Array.isArray(pkg.files)) {
  const disallowedPatterns = ['.env', '.pem', '.key', '.acr-cache', 'tests', '.github'];
  const hasDisallowed = pkg.files.some((f) => disallowedPatterns.includes(f));
  if (!hasDisallowed && pkg.files.includes('bin') && pkg.files.includes('src')) {
    pass('Package files whitelist', pkg.files.join(', '));
  } else {
    fail('Package files whitelist', `Suspicious or incomplete files array: ${JSON.stringify(pkg.files)}`);
  }
} else {
  fail('Package files whitelist', 'Missing files array in package.json');
}

console.log('\n-----------------------------------');
if (failures === 0) {
  console.log('[SUCCESS] All pre-release checks passed.\n');
  process.exitCode = 0;
} else {
  console.error(`[FAILURE] ${failures} pre-release check(s) failed.\n`);
  process.exitCode = 1;
}
