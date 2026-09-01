# ai-code-reviewer

A production-quality, terminal-first npm package for reviewing JavaScript and React repositories using deterministic static analysis, code complexity analysis, and AI.

## Project Purpose

`ai-code-reviewer` inspects JavaScript and React codebases for syntax integrity, structural anti-patterns, quality issues, and potential bugs. It combines deterministic static parsing, ESLint analysis, and AST-based complexity analysis with targeted insights to deliver clear, actionable feedback directly in your terminal or formatted as JSON.

## Review Pipeline

```text
Configuration
→ File discovery
→ Babel parsing
→ ESLint static analysis
→ Complexity analysis
→ Finding normalization
→ Deduplication & severity filtering
→ Terminal or JSON report
```

## Current Capabilities

* **Deterministic Static Analysis Active:** Evaluates JavaScript and React JSX files using internal ESLint rules focused on bug prevention.
* **AST Complexity Analysis Active:** Evaluates function line length, parameter count, cyclomatic complexity, and control-flow decision nesting depth using AST inspection.
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

## Analyzers & Rules

### 1. ESLint Static Analyzer

Inspects 28 core bug-prevention rules including `no-undef`, `no-unreachable`, `no-dupe-keys`, `use-isnan`, `valid-typeof`, `no-fallthrough`, `eqeqeq`, and `no-unused-vars`.

### 2. AST Complexity Analyzer

Measures structural maintainability metrics for every function, method, and callback:

* **Function Length (`complexity/function-too-long`)**: Total physical lines spanning the function (`endLine - startLine + 1`).
* **Parameter Count (`complexity/too-many-parameters`)**: Top-level formal parameters, including destructuring and rest parameters.
* **Cyclomatic Complexity (`complexity/high-cyclomatic-complexity`)**: Decision points (`if`, `? :`, loops, `catch`, `switch` cases, `&&`, `||`, `??`).
* **Decision Nesting Depth (`complexity/deep-nesting`)**: Maximum control-flow nesting depth (`if`, loops, `switch`, `try`/`catch`).

> [!NOTE]
> Complexity metrics are maintainability and readability signals, not proof that code is incorrect. Adjust threshold values gradually to fit your team's architecture.

### Severity Rules for Complexity Findings

* **`complexity/function-too-long`**: `medium` when exceeding threshold, `high` when at least 2× threshold.
* **`complexity/too-many-parameters`**: `low` when 1 above threshold, `medium` when > 1 above threshold, `high` when at least 2× threshold.
* **`complexity/high-cyclomatic-complexity`**: `medium` when exceeding threshold, `high` when at least 2× threshold.
* **`complexity/deep-nesting`**: `medium` when exceeding threshold, `high` when at least 2× threshold.

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
  "maxFileSizeKb": 150,
  "analyzers": {
    "complexity": {
      "enabled": true,
      "maxFunctionLines": 80,
      "maxParameters": 5,
      "maxCyclomaticComplexity": 10,
      "maxNestingDepth": 4
    }
  }
}
```

### Disabling Complexity Analysis

To disable complexity analysis while keeping ESLint static analysis active:

```json
{
  "analyzers": {
    "complexity": {
      "enabled": false
    }
  }
}
```

## JSON Output Example

```json
{
  "status": "review-complete",
  "rootDirectory": "/path/to/project",
  "findings": [
    {
      "source": "complexity",
      "ruleId": "complexity/high-cyclomatic-complexity",
      "severity": "medium",
      "category": "maintainability",
      "title": "High cyclomatic complexity",
      "message": "Function 'processOrder' has cyclomatic complexity 14, exceeding the configured maximum of 10.",
      "relativePath": "src/orders.js",
      "lineStart": 20,
      "columnStart": 1,
      "lineEnd": 75,
      "columnEnd": 2,
      "suggestion": "Break the decision logic into smaller focused functions or dispatch tables.",
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
    "functionsAnalyzed": 4,
    "findingsBySource": {
      "eslint": 0,
      "complexity": 1
    },
    "severity": {
      "critical": 0,
      "high": 0,
      "medium": 1,
      "low": 0
    },
    "ignored": 0,
    "tooLarge": 0,
    "limited": 0
  }
}
```

## Programmatic API

```js
import {
  loadConfig,
  discoverFiles,
  parseJavaScript,
  analyzeWithEslint,
  analyzeComplexity,
  reviewRepository
} from 'ai-code-reviewer';

// Run complete repository review
const result = await reviewRepository({
  rootDirectory: process.cwd(),
  config: { severityThreshold: 'high' }
});

console.log(`Analyzed ${result.summary.discovered} files with ${result.findings.length} findings.`);
```

## License

MIT License. Copyright (c) 2026 Debdip Bhattacharya.