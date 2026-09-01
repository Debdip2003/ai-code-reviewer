# ai-code-reviewer

A production-quality, terminal-first npm package for reviewing JavaScript and React repositories using deterministic static analysis, code complexity analysis, React-specific inspections, and AI.

## Project Purpose

`ai-code-reviewer` inspects JavaScript and React codebases for syntax integrity, structural anti-patterns, quality issues, and potential bugs. It combines deterministic static parsing, ESLint analysis, React Hook rules, and AST-based code analysis with targeted insights to deliver clear, actionable feedback directly in your terminal or formatted as JSON.

## Review Pipeline

```text
Configuration
→ File discovery
→ Babel parsing
→ ESLint and React Hooks rules
→ Complexity analysis
→ Custom React AST analysis
→ Finding normalization
→ Deduplication & severity filtering
→ Terminal or JSON report
```

## Current Capabilities

* **Deterministic Static Analysis Active:** Evaluates JavaScript and React JSX files using internal ESLint rules focused on bug prevention.
* **React Hooks Rules Active:** Enforces official React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) via isolated flat configuration.
* **Custom React AST Analysis Active:** Detects oversized components, direct state mutations, async `useEffect` callbacks, oversized effect callbacks, and array-index keys.
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

### 1. ESLint Static & React Hook Rules

* **Core JavaScript Rules**: Inspects 28 bug-prevention rules including `no-undef`, `no-unreachable`, `no-dupe-keys`, `use-isnan`, `valid-typeof`, `no-fallthrough`, `eqeqeq`, and `no-unused-vars`.
* **Official React Hook Rules**:
  * `react-hooks/rules-of-hooks` (`high`): Enforces Hook call rules (only call Hooks at the top level of React function components or custom Hooks).
  * `react-hooks/exhaustive-deps` (`medium`): Verifies effect dependency arrays for completeness.

### 2. Custom React AST Analyzer

* **Large Component (`react/component-too-large`)**: Flags function or class components exceeding `maxComponentLines` (default 200).
* **Direct State Mutation (`react/direct-state-mutation`)**: Flags mutating array methods (`push`, `pop`, `splice`, etc.), property assignments (`items[0] = x`), or update expressions (`count++`) directly on `useState` variables.
* **Async Effect Callback (`react/async-effect-callback`)**: Flags `useEffect(async () => ...)` because async callbacks return a Promise instead of an effect cleanup function.
* **Large Effect Callback (`react/effect-too-large`)**: Flags inline effect callbacks exceeding `maxEffectLines` (default 50).
* **Array-Index Key (`react/array-index-key`)**: Flags direct usage of map index parameters as React `key` props (`.map((item, index) => <Comp key={index} />)`).

### 3. AST Complexity Analyzer

* **Function Length (`complexity/function-too-long`)**: Total physical lines spanning the function (`endLine - startLine + 1`).
* **Parameter Count (`complexity/too-many-parameters`)**: Top-level formal parameters, including destructuring and rest parameters.
* **Cyclomatic Complexity (`complexity/high-cyclomatic-complexity`)**: Decision points (`if`, `? :`, loops, `catch`, `switch` cases, `&&`, `||`, `??`).
* **Decision Nesting Depth (`complexity/deep-nesting`)**: Maximum control-flow nesting depth (`if`, loops, `switch`, `try`/`catch`).

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
    },
    "react": {
      "enabled": true,
      "hooks": true,
      "maxComponentLines": 200,
      "maxEffectLines": 50,
      "detectDirectStateMutation": true,
      "detectArrayIndexKeys": true
    }
  }
}
```

### Disabling React Analysis or Hook Rules

```json
{
  "analyzers": {
    "react": {
      "enabled": false
    }
  }
}
```

To disable only official React Hook ESLint rules while keeping custom React AST rules:

```json
{
  "analyzers": {
    "react": {
      "hooks": false
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
      "source": "react",
      "ruleId": "react/direct-state-mutation",
      "severity": "high",
      "category": "correctness",
      "title": "Direct React state mutation",
      "message": "React state 'items' is mutated directly through 'push'.",
      "relativePath": "src/ProductList.jsx",
      "lineStart": 18,
      "columnStart": 5,
      "lineEnd": 18,
      "columnEnd": 22,
      "suggestion": "Create a new value and pass it to the state setter instead of mutating React state directly.",
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
    "functionsAnalyzed": 2,
    "componentsAnalyzed": 1,
    "effectsAnalyzed": 1,
    "stateVariablesTracked": 1,
    "findingsBySource": {
      "eslint": 0,
      "complexity": 0,
      "react": 1
    },
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

## Programmatic API

```js
import {
  loadConfig,
  discoverFiles,
  parseJavaScript,
  analyzeWithEslint,
  analyzeComplexity,
  analyzeReact,
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