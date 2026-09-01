# ai-code-reviewer

A production-quality, terminal-first npm package for reviewing JavaScript and React repositories using deterministic static analysis and AI.

## Project Purpose

`ai-code-reviewer` inspects JavaScript and React codebases for syntax integrity, architectural anti-patterns, quality issues, and potential bugs. It combines deterministic static parsing and ESLint analysis with targeted insights to deliver clear, actionable feedback directly in your terminal or formatted as JSON.

## Review Pipeline

```text
Configuration
→ File discovery
→ JavaScript/JSX parsing (Babel)
→ ESLint static analysis
→ Finding normalization
→ Severity filtering & deduplication
→ Terminal or JSON report
```

## Current Status & Capabilities

* **Deterministic Static Analysis Active:** Evaluates JavaScript and React JSX files using internal ESLint rules focused on bug prevention.
* **Isolated Configuration:** Operates with a controlled internal flat configuration; the target repository's `.eslintrc` or `eslint.config.js` is **never loaded**.
* **Zero Source Modification:** Operates in pure read-only mode (`fix: false`) and **never modifies** source files.
* **AI Provider Integration:** AI-powered reasoning and semantic recommendations will be integrated in upcoming releases.
* **Git Diff Analysis:** Differential review via `--changed` is reserved for a future release.

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

### CI / Automation Execution

```bash
npx ai-code-reviewer review . --format json --severity high
```

## CLI Usage

### Initialize Configuration

Bootstrap `.aireviewerrc.json` in the project root:

```bash
# Initialize configuration
ai-code-reviewer init

# Force overwrite existing configuration
ai-code-reviewer init --force
```

### Review & Analyze Files

```bash
# Review current repository with default medium threshold
ai-code-reviewer review .

# Review a specific subdirectory with high severity threshold
ai-code-reviewer review ./src --severity high

# Emit machine-readable JSON report
ai-code-reviewer review . --format json

# Limit file discovery count
ai-code-reviewer review ./src --max-files 25
```

## Exit Codes

* **`0`**: Analysis completed successfully and no finding met or exceeded the configured severity threshold.
* **`1`**: Review threshold triggered (at least one finding met or exceeded the severity threshold).
* **`2`**: Configuration, file scanning, reading, Babel parsing, or analyzer failure.

## Severity Levels & Categories

### Finding Severities

* **`critical`**: Reserved for high-confidence security and data loss vulnerabilities.
* **`high`**: Likely runtime errors or severe behavioral bugs (e.g., `no-undef`, `no-unreachable`, `no-dupe-keys`).
* **`medium`**: Suspicious logic or maintainability issues that commonly cause defects (e.g., `eqeqeq`, `no-unused-vars`, `no-fallthrough`).
* **`low`**: Minor maintainability observations with limited functional impact.

### Finding Categories

* `correctness` – Runtime correctness and logic flaws
* `security` – Security vulnerabilities and hazardous patterns
* `performance` – Performance bottlenecks and resource leaks
* `maintainability` – Code maintainability and unused structures

## JSON Output Example

```json
{
  "status": "review-complete",
  "rootDirectory": "/path/to/project",
  "findings": [
    {
      "source": "eslint",
      "ruleId": "no-undef",
      "severity": "high",
      "category": "correctness",
      "title": "Undefined identifier",
      "message": "'total' is not defined.",
      "relativePath": "src/cart.js",
      "lineStart": 12,
      "columnStart": 5,
      "lineEnd": 12,
      "columnEnd": 10,
      "suggestion": null,
      "fixable": false
    }
  ],
  "failures": [],
  "summary": {
    "discovered": 1,
    "parsed": 1,
    "analyzed": 1,
    "failed": 0,
    "findings": 1,
    "severity": {
      "critical": 0,
      "high": 1,
      "medium": 0,
      "low": 0
    },
    "ignored": 0,
    "tooLarge": 0,
    "limited": 0
  }
}
```

## Configuration

### Configuration File (`.aireviewerrc.json`)

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

### Configuration Hierarchy

```text
DEFAULT_CONFIG  <  .aireviewerrc.json  <  CLI Flags (--format, --max-files, --severity)
```

## Programmatic API

```js
import {
  loadConfig,
  discoverFiles,
  parseJavaScript,
  analyzeWithEslint,
  reviewRepository
} from 'ai-code-reviewer';

// Run complete repository review
const result = await reviewRepository({
  rootDirectory: process.cwd(),
  config: { severityThreshold: 'high' }
});

console.log(`Discovered ${result.summary.discovered} files with ${result.findings.length} findings.`);
```

## Publishing Checklist

```bash
# 1. Log in to npm account
npm login
npm whoami

# 2. Run automated tests and validation
npm test
npm run check

# 3. Preview tarball contents
npm run pack:dry-run

# 4. Publish to registry
npm publish --tag beta
```

## License

MIT License. Copyright (c) 2026 Debdip Bhattacharya.