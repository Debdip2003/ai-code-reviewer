# ai-code-reviewer

A production-quality, terminal-first npm package for reviewing JavaScript and React repositories using static analysis and AI.

## Project Purpose

`ai-code-reviewer` inspects JavaScript and React codebases for syntax integrity, architectural anti-patterns, quality issues, and security vulnerabilities. It combines deterministic static parsing with targeted AI-powered insights to deliver clear, actionable feedback directly in your terminal or formatted as JSON.

## Current Development Status

> **Note:** The current phase implements the configuration loader, ignore-rule processing, JavaScript/JSX AST parsing using Babel, and bounded concurrency scanning.
>
> **Current Limitations:**
> * **JavaScript & JSX Only:** Supported extensions are `.js`, `.jsx`, `.mjs`, and `.cjs`. TypeScript and Flow syntax are not yet supported.
> * **No AI Review Engine Yet:** Static and AI code review rules will be connected in upcoming releases.
> * **No Git Changed-File Review Yet:** The `--changed` differential review flag is reserved for a future release.
> * **Zero Code Modification:** `ai-code-reviewer` operates strictly in read-only mode and never modifies source files.
> * **Code Splitting:** Multi-pass chunk review architecture for ultra-large enterprise codebases is planned separately for V2.

## Node.js Requirement

* **Node.js**: Version `20.0.0` or newer is required (`"engines": { "node": ">=20" }`).
* **Module System**: Pure ES Modules (`"type": "module"`).

## Supported File Extensions

* `.js` – Standard JavaScript
* `.jsx` – React JSX components
* `.mjs` – ECMAScript Modules
* `.cjs` – CommonJS Modules

## Installation

### Add to an Existing Project

```bash
npm install --save-dev ai-code-reviewer
```

### One-Time Execution via npx

```bash
npx ai-code-reviewer review .
```

### Local Development / Linking

```bash
# Clone and setup locally
git clone <repository-url>
cd ai-code-reviewer
npm install

# Link package globally for local CLI testing
npm link

# Test CLI
ai-code-reviewer --help
```

## CLI Usage

### Initialize Configuration

Bootstrap a configuration file in the project root:

```bash
# Initialize .aireviewerrc.json
ai-code-reviewer init

# Force overwrite an existing configuration file
ai-code-reviewer init --force
```

### Review & Parse Files

```bash
# Scan and parse files in the current repository
ai-code-reviewer review .

# Scan and parse a specific subdirectory
ai-code-reviewer review ./src

# Emit machine-readable JSON output
ai-code-reviewer review . --format json

# Limit file discovery and review count
ai-code-reviewer review ./src --max-files 25
```

### JSON Output Example

```json
{
  "status": "parse-complete",
  "rootDirectory": "/path/to/project",
  "files": [
    {
      "relativePath": "src/App.jsx",
      "sourceType": "module",
      "statementCount": 8,
      "imports": [
        {
          "source": "react",
          "specifierCount": 2,
          "line": 1
        }
      ],
      "exports": [
        {
          "kind": "default",
          "name": "App",
          "line": 12
        }
      ],
      "functions": [
        {
          "name": "App",
          "kind": "function-declaration",
          "async": false,
          "line": 12
        }
      ],
      "classes": [],
      "reactComponentCandidates": [
        {
          "name": "App",
          "kind": "function",
          "line": 12
        }
      ]
    }
  ],
  "failures": [],
  "summary": {
    "discovered": 1,
    "parsed": 1,
    "failed": 0,
    "ignored": 14,
    "tooLarge": 0,
    "limited": 0
  }
}
```

## Configuration

### Configuration File (`.aireviewerrc.json`)

Configure scanning and review settings in `.aireviewerrc.json`:

```json
{
  "include": [
    "**/*.js",
    "**/*.jsx",
    "**/*.mjs",
    "**/*.cjs"
  ],
  "exclude": [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".next/**",
    "public/**",
    "vendor/**",
    "**/*.min.js"
  ],
  "outputFormat": "terminal",
  "concurrency": 2,
  "severityThreshold": "medium",
  "maxFiles": 100,
  "maxFileSizeKb": 150
}
```

### Ignore Rule Precedence

`ai-code-reviewer` combines ignore rules from multiple sources:
1. Built-in and configured `exclude` patterns
2. Root `.gitignore` rules
3. Root `.aireviewerignore` rules (dedicated ignore rules for reviewer)
4. Negation patterns (e.g. `!src/generated/keep.js`) are supported

### Configuration Hierarchy

```text
DEFAULT_CONFIG  <  .aireviewerrc.json  <  CLI Flags (--format, --max-files)
```

## Programmatic API

You can import and use `ai-code-reviewer` programmatically in Node.js applications:

```js
import {
  loadConfig,
  discoverFiles,
  parseJavaScript,
  parseFile,
  summarizeAst,
  DEFAULT_CONFIG
} from 'ai-code-reviewer';

// 1. Load configuration
const config = await loadConfig({ rootDirectory: process.cwd() });

// 2. Discover files
const { files } = await discoverFiles({
  rootDirectory: config.rootDirectory,
  includePatterns: config.include,
  excludePatterns: config.exclude
});

// 3. Parse a file and extract summary
const { ast } = await parseFile({
  absolutePath: files[0].absolutePath,
  relativePath: files[0].relativePath
});

const summary = summarizeAst({ ast, relativePath: files[0].relativePath });
console.log(summary);
```

## Development & Publishing Checklist

### Development Commands

* `npm test` – Run test suite with Vitest
* `npm run test:watch` – Run Vitest in interactive watch mode
* `npm run check` – Verify CLI executable invocation
* `npm run pack:dry-run` – Preview package tarball contents

### npm Publishing Workflow

> **Warning:** Do not run `npm publish` until the package name, contents, version, and npm account have been verified.

Before publishing:

```bash
# 1. Log in to your npm account
npm login

# 2. Confirm your authenticated user
npm whoami

# 3. Run all automated tests and syntax checks
npm test
npm run check

# 4. Preview the tarball archive contents
npm run pack:dry-run

# 5. Publish to npm registry (use beta tag for pre-releases)
npm publish --tag beta
```

## License

MIT License. Copyright (c) 2026 Debdip Bhattacharya.