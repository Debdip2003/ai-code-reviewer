# ACR (Autonomous Code Reviewer)

A production-quality, terminal-first npm package for reviewing JavaScript and React repositories using deterministic static analysis, code complexity analysis, React-specific inspections, and AI.

## Project Purpose

`ACR` (`acr`) inspects JavaScript and React codebases for syntax integrity, structural anti-patterns, quality issues, and potential bugs. It combines deterministic static parsing, ESLint analysis, React Hook rules, and AST-based code analysis with targeted AI insights to deliver clear, actionable feedback directly in your terminal or formatted as JSON.

## Review Pipeline

```text
Configuration & Diagnostics
→ File discovery & Git scope resolution
→ Babel AST parsing
→ ESLint and React Hooks rules
→ Complexity analysis
→ Custom React AST analysis
→ Semantic code chunking (filtered by changed lines)
→ Token and budget checks
→ Provider abstraction & OpenAI Responses API (Structured Outputs)
→ Finding normalization & confidence filtering (≥ 0.65)
→ Scope-based finding filtering (changed lines)
→ Store sanitized results in local cache
→ Deduplication & severity filtering
→ Terminal or JSON report with monotonic timing
```

## Capabilities

* **Deterministic Static Analysis Active:** Evaluates JavaScript and React JSX files using internal ESLint rules focused on bug prevention.
* **React Hooks Rules Active:** Enforces official React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) via isolated flat configuration.
* **Custom React AST Analysis Active:** Detects oversized components, direct state mutations, async `useEffect` callbacks, oversized effect callbacks, and array-index keys.
* **AST Complexity Analysis Active:** Evaluates function line length, parameter count, cyclomatic complexity, and control-flow decision nesting depth using AST inspection.
* **Git-Aware Changed-File Review (`--changed`, `--base <ref>`):** Read-only Git operations to review only modified, staged, added, or branched files and lines.
* **Changed-Line Finding & Chunk Filtering:** Restricts deterministic findings and AI chunks to modified line hunks while preserving full function AST context.
* **Content-Addressed Local Cache (`.acr-cache/`):** Deterministic SHA-256 caching of normalized findings, metrics, and AST summaries with zero source code or API key persistence.
* **AI Code Review (Responses API Structured Outputs):** Inspects semantic units for subtle logic bugs, race conditions, edge cases, security risks, and unhandled promise rejections using OpenAI or Groq models.
* **Bring-Your-Own-Key (BYOK):** AI review uses your own API key via `OPENAI_API_KEY` (or `GROQ_API_KEY`). API keys are never stored in config files or passed via CLI args.
* **Diagnostic Toolchain Health Check (`acr doctor`):** Inspects Node.js version, Git readiness, cache path safety, config validity, and key status.
* **Graceful Signal Cancellation:** Full support for `AbortController` and `SIGINT`/`SIGTERM` termination across all stages with exit code `130`.
* **Zero Source Modification:** Operates in pure read-only mode (`fix: false`) and **never modifies** repository files or Git state.

## Supported File Extensions

* `.js` – Standard JavaScript
* `.jsx` – React JSX components
* `.mjs` – ECMAScript Modules
* `.cjs` – CommonJS Modules

## Installation

### Add to an Existing Project

```bash
npm install --save-dev @code/acr
```

### One-Time Execution via npx

```bash
npx @code/acr review .
```

### Run Diagnostics

```bash
npx @code/acr doctor
```

### CI / Automation Execution

```bash
npx @code/acr review . --format json --severity high
```

## AI Review & Environment Setup

AI review is **disabled by default**. To activate AI assistance, provide your OpenAI API key and pass `--ai` or enable it in `.acrrc.json`.

### Setting `OPENAI_API_KEY`

#### PowerShell (Windows)

```powershell
$env:OPENAI_API_KEY="your-key"
```

#### Command Prompt (Windows)

```cmd
set OPENAI_API_KEY=your-key
```

#### macOS & Linux (Bash / Zsh)

```bash
export OPENAI_API_KEY="your-key"
```

> **Security Note:** Never commit API keys or `.env` files to version control. API keys are never accepted as command-line arguments to prevent shell history exposure.

## CLI Usage

### System & Configuration Diagnostics (`acr doctor`)

Runs read-only environment and configuration sanity checks:

```bash
# Run diagnostics for current repository
acr doctor

# Run diagnostics for a specific project directory
acr doctor ./path/to/project

# Emit machine-readable diagnostics JSON
acr doctor . --format json
```

### Initialize Configuration (`acr init`)

Bootstrap `.acrrc.json` in the project root:

```bash
# Initialize configuration
acr init

# Force overwrite existing configuration
acr init --force
```

### Review & Analyze Files (`acr review`)

```bash
# Review current repository with deterministic analyzers (AI disabled by default)
acr review .

# Review only git-changed files in the working tree (staged, unstaged, untracked)
acr review . --changed

# Review changes against a base branch or commit reference
acr review . --changed --base main

# Enable AI code review using default model (gpt-5.6-luna)
acr review . --ai

# Review with a specific AI model
acr review . --ai --model gpt-5.6-luna

# Review with maximum estimated AI budget ceiling in USD
acr review . --ai --max-ai-cost 0.10

# Explicitly disable AI review (overriding configuration file)
acr review . --no-ai

# Explicitly disable local caching (overriding configuration file)
acr review . --no-cache

# Review a specific subdirectory with high severity threshold
acr review ./src --severity high

# Emit machine-readable JSON report
acr review . --format json

# Enable debug logging (written strictly to stderr)
acr review . --debug

# Limit file discovery count
acr review ./src --max-files 25
```

### Cache Management (`acr cache clear`)

```bash
# Clear all cached review results for the current project
acr cache clear

# Clear cache for a specific project directory
acr cache clear ./path/to/project

# Clear cache and emit JSON status
acr cache clear . --format json
```

## Exit Codes

* **`0`**: Analysis completed successfully and no finding met or exceeded the configured severity threshold.
* **`1`**: Review threshold triggered (at least one finding met or exceeded the severity threshold).
* **`2`**: Configuration, Git execution, file scanning, reading, Babel parsing, analyzer failure, missing API key (when AI is enabled), or AI budget limit reached.
* **`130`**: Process interrupted by user (`SIGINT` / `SIGTERM` / Ctrl+C).

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

### 4. AI Review Analyzer

* **Category Focus**:
  * Correctness and subtle logic edge cases
  * Security risks visible in the code
  * Resource and performance anti-patterns
  * Maintainability issues not covered by deterministic linters
  * Visible unhandled asynchronous rejections and error handling gaps
* **Confidence Filtering**: AI findings require a minimum confidence score of `0.65`.
* **Line Range Guard**: AI findings must fall strictly within the semantic chunk's verified line range.

## Configuration

### Configuration File (`.acrrc.json`)

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
    ".acr-cache/**",
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
  },
  "cache": {
    "enabled": true,
    "directory": ".acr-cache",
    "maxEntries": 1000
  },
  "ai": {
    "enabled": false,
    "provider": "openai",
    "model": "gpt-5.6-luna",
    "reasoningEffort": "low",
    "maxOutputTokens": 2000,
    "maxRequests": 20,
    "maxInputTokensPerChunk": 12000,
    "maxEstimatedCostUsd": 0.25,
    "timeoutMs": 30000,
    "retries": 2
  }
}
```

## Model Pricing & Cost Controls

Model pricing is versioned and informational:

| Model | Input / 1M tokens | Output / 1M tokens | Pricing as of |
| :--- | :--- | :--- | :--- |
| `gpt-5.6-luna` | $0.20 | $1.20 | 2026-09-05 |

* For custom or unrecognized model names, request and token limits remain strictly enforced while cost estimation is reported as `unavailable for configured model`.
* AI findings are non-deterministic recommendations and should be verified before merging.

## JSON Output Example

```json
{
  "status": "review-complete",
  "rootDirectory": "/path/to/project",
  "findings": [
    {
      "source": "ai",
      "ruleId": "ai/unhandled-async-error",
      "severity": "high",
      "category": "correctness",
      "title": "Unhandled Async Promise Rejection",
      "message": "The async call to fetchData() lacks a catch block or try/catch wrapper.",
      "relativePath": "src/api.js",
      "lineStart": 10,
      "columnStart": 1,
      "lineEnd": 15,
      "columnEnd": 1,
      "suggestion": "Wrap the call in a try/catch block to handle network errors.",
      "fixable": false,
      "confidence": 0.95
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
    "effectsAnalyzed": 0,
    "stateVariablesTracked": 0,
    "findingsBySource": {
      "eslint": 0,
      "complexity": 0,
      "react": 0,
      "ai": 1
    },
    "severity": {
      "critical": 0,
      "high": 1,
      "medium": 0,
      "low": 0
    },
    "ignored": 0,
    "tooLarge": 0,
    "limited": 0,
    "scope": {
      "mode": "full",
      "gitMode": null,
      "baseRef": null,
      "changedFiles": null,
      "eligibleFiles": 1,
      "deletedFiles": 0
    },
    "cache": {
      "enabled": true,
      "hits": 0,
      "misses": 1,
      "writes": 1,
      "evictions": 0,
      "invalidEntries": 0,
      "directory": "/path/to/project/.acr-cache"
    },
    "ai": {
      "enabled": true,
      "model": "gpt-5.6-luna",
      "chunksCreated": 2,
      "chunksReviewed": 2,
      "chunksSkipped": 0,
      "requests": 2,
      "cacheHits": 0,
      "estimatedCostUsd": 0.00045,
      "stoppedByBudget": false
    },
    "timing": {
      "totalMs": 142,
      "discoveryMs": 12,
      "analysisMs": 130,
      "aiMs": 0
    }
  }
}
```

## Programmatic API

```js
import {
  loadConfig,
  discoverFiles,
  getChangedFiles,
  getChangedLineRanges,
  filterFindingsByScope,
  FileCache,
  generateCacheKey,
  parseJavaScript,
  analyzeWithEslint,
  analyzeComplexity,
  analyzeReact,
  createSemanticChunks,
  createAIProvider,
  reviewWithAI,
  reviewRepository,
  runDoctorChecks,
  EXIT_CODES
} from '@code/acr';

// Run review in git-changed mode
const changedInfo = await getChangedFiles({ rootDirectory: process.cwd() });
const result = await reviewRepository({
  rootDirectory: process.cwd(),
  reviewScope: {
    mode: 'changed',
    gitMode: changedInfo.mode,
    files: changedInfo.files.reduce((acc, f) => {
      acc[f.relativePath] = { status: f.status, changedLines: [] };
      return acc;
    }, {})
  }
});

console.log(`Analyzed ${result.summary.analyzed} changed files with ${result.findings.length} findings.`);
```

## License

MIT License. Copyright (c) 2026 Debdip Bhattacharya.