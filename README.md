# ACR (Autonomous Code Reviewer)

A production-quality, terminal-first npm package for reviewing and safely modularizing JavaScript, TypeScript, and React repositories using deterministic static analysis, complexity metrics, AST transformations, and AI.

## Project Purpose

`ACR` (`acr`) inspects JavaScript, TypeScript, and React codebases for syntax integrity, structural anti-patterns, quality issues, and potential bugs. It combines deterministic static parsing, ESLint analysis, React Hook rules, and AST-based code analysis with targeted AI insights to deliver clear, actionable feedback directly in your terminal or formatted as JSON.

Additionally, ACR provides an intelligent, automated **code-splitting engine** to safely extract oversized components, hooks, and utilities into dedicated files with transactional safety, optimistic concurrency locking, byte-accurate backups, and instant rollback.

## Review Pipeline

```text
Configuration & Diagnostics
→ File discovery & Git scope resolution
→ Babel AST parsing (JS, JSX, TS, TSX)
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

* **Deterministic Static Analysis Active:** Evaluates JavaScript, TypeScript, and React files using internal ESLint rules focused on bug prevention.
* **React Hooks Rules Active:** Enforces official React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) via isolated flat configuration.
* **Custom React AST Analysis Active:** Detects oversized components, direct state mutations, async `useEffect` callbacks, oversized effect callbacks, and array-index keys.
* **AST Complexity Analysis Active:** Evaluates function line length, parameter count, cyclomatic complexity, and control-flow decision nesting depth using AST inspection.
* **Safe Code Splitting & Modularization (`acr split`):** Discovers extraction candidates (React components, custom hooks, utilities), generates exact dependency and prop boundary contracts, previews transformations in memory, and applies multi-file refactors with atomic guarantees, persistent backups (`.acr/backups/`), and single-command rollback.
* **Git-Aware Changed-File Review (`--changed`, `--base <ref>`):** Read-only Git operations to review only modified, staged, added, or branched files and lines.
* **Changed-Line Finding & Chunk Filtering:** Restricts deterministic findings and AI chunks to modified line hunks while preserving full function AST context.
* **Content-Addressed Local Cache (`.acr-cache/`):** Deterministic SHA-256 caching of normalized findings, metrics, and AST summaries with zero source code or API key persistence.
* **AI Code Review (Responses API Structured Outputs):** Inspects semantic units for subtle logic bugs, race conditions, edge cases, security risks, and unhandled promise rejections using OpenAI or Groq models.
* **Bring-Your-Own-Key (BYOK):** AI review uses your own API key via `OPENAI_API_KEY` (or `GROQ_API_KEY`). API keys are never stored in config files or passed via CLI args.
* **Diagnostic Toolchain Health Check (`acr doctor`):** Inspects Node.js version, Git readiness, cache path safety, config validity, and key status.
* **Graceful Signal Cancellation:** Full support for `AbortController` and `SIGINT`/`SIGTERM` termination across all stages with exit code `130`.
* **Zero Source Modification on Review/Preview:** Review and preview commands operate in pure read-only mode and **never modify** repository files or Git state.

## Supported File Extensions

* `.js` – Standard JavaScript
* `.jsx` – React JSX components
* `.mjs` – ECMAScript Modules
* `.cjs` – CommonJS Modules
* `.ts` – TypeScript
* `.tsx` – TypeScript JSX components

## Installation

### Add to an Existing Project

```bash
npm install -D @debdipbhat/acr
```

### One-Time Execution via npx

```bash
npx @debdipbhat/acr review .
```

### Run Diagnostics

```bash
npx acr doctor
```

### CI / Automation Execution

```bash
npx acr review . --format json --severity high
```

## AI Review & Environment Setup

AI review is **disabled by default**. To activate AI assistance, provide your **Groq** or **OpenAI** API key and pass `--ai` or enable it in `.acrrc.json`.

ACR supports both **Groq** and **OpenAI** providers (via Bring-Your-Own-Key).

### Setting `GROQ_API_KEY` (Recommended for Groq)

#### PowerShell (Windows)

```powershell
$env:GROQ_API_KEY="gsk_your-groq-key"
```

#### Command Prompt (Windows)

```cmd
set GROQ_API_KEY=gsk_your-groq-key
```

#### macOS & Linux (Bash / Zsh)

```bash
export GROQ_API_KEY="gsk_your-groq-key"
```

### Setting `OPENAI_API_KEY` (for OpenAI)

#### PowerShell (Windows)

```powershell
$env:OPENAI_API_KEY="your-openai-key"
```

#### Command Prompt (Windows)

```cmd
set OPENAI_API_KEY=your-openai-key
```

#### macOS & Linux (Bash / Zsh)

```bash
export OPENAI_API_KEY="your-openai-key"
```

### Local `.env` File Support

You can also place your API keys in a local `.env` file in your repository root:

```env
# Groq API Key
GROQ_API_KEY=gsk_your-groq-key

# Or OpenAI API Key
OPENAI_API_KEY=your-openai-key
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

ACR exports a comprehensive, type-safe ESM programmatic API for integration into custom CI scripts, editors, or developer tooling:

```js
import {
  // Code Review & Diagnostics
  reviewRepository,
  loadConfig,
  discoverFiles,
  getChangedFiles,
  getChangedLineRanges,
  runDoctorChecks,
  EXIT_CODES,

  // Code Splitting & Modularization
  createSplitPlan,
  createTransformationPlan,
  applyTransformation,
  rollbackOperation,
  listOperationHistory,
  SPLIT_EXIT_CODES,

  // Parsers & AST Analyzers
  parseJavaScript,
  analyzeWithEslint,
  analyzeComplexity,
  analyzeReact
} from '@debdipbhat/acr';

// 1. Run automated code review on git changes
const changedInfo = await getChangedFiles({ rootDirectory: process.cwd() });
const reviewResult = await reviewRepository({
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

// 2. Discover split candidates in a component
const splitPlan = await createSplitPlan({
  filePath: 'src/Dashboard.jsx',
  rootDirectory: process.cwd()
});
console.log('Found candidates:', splitPlan.candidates.map(c => c.id));

// 3. Generate transformation plan preview
const plan = await createTransformationPlan({
  filePath: 'src/Dashboard.jsx',
  candidateId: 'user-card',
  rootDirectory: process.cwd()
});
console.log('Target code:\n', plan.previews.targetFile.code);

// 4. Safely apply transformation
if (plan.safety === 'automatic-ready') {
  const result = await applyTransformation({
    plan,
    rootDirectory: process.cwd(),
    nonInteractive: true
  });
  console.log('Applied operation ID:', result.operationId);
}
```

## Code Splitting & Safe Modularization (`acr split`)

ACR provides a robust, multi-phase code-splitting workflow: candidate discovery, exact boundary planning, in-memory preview, safe transactional application with persistent backups, operation history, and automatic/manual rollback.

### Recommended Workflow

```bash
# 1. Verify working directory is clean
git status

# 2. Preview the exact transformation without modifying disk
acr split src/components/Dashboard.jsx --candidate user-card --preview

# 3. Apply the split safely (creates backup before applying)
acr split src/components/Dashboard.jsx --candidate user-card --apply

# 4. Review git diff and run your test suite
git diff
npm test
```

Recommended `.gitignore` addition:
```gitignore
.acr/backups/
.acr/split.lock
```

---

### 1. Candidate Discovery

Scan a file to list available extraction candidates with stable identifiers and safety levels:

```bash
acr split src/components/Dashboard.jsx
```

### 2. Candidate Selection & Transformation Preview

Preview the planned imports, exports, props, and generated code in memory:

```bash
# View boundary plan and validation checks
acr split src/components/Dashboard.jsx --candidate user-card

# View generated CREATE <target> and UPDATE <source> code blocks
acr split src/components/Dashboard.jsx --candidate user-card --preview

# Emit structured JSON preview
acr split src/components/Dashboard.jsx --candidate user-card --format json
```

### 3. Safe Application (`--apply`)

Apply an `automatic-ready` candidate with transaction guarantees, optimistic concurrency protection, and persistent backup:

```bash
# Interactive application (prompts for confirmation)
acr split src/components/Dashboard.jsx --candidate user-card --apply

# Non-interactive application (for scripts / CI)
acr split src/components/Dashboard.jsx --candidate user-card --apply --yes

# Custom target location
acr split src/components/Dashboard.jsx --candidate user-card --target src/components/cards/UserCard.jsx --apply --yes

# Machine-readable JSON output
acr split src/components/Dashboard.jsx --candidate user-card --apply --yes --format json
```

### 4. Split History (`acr split history`)

Inspect previous split operations recorded in `.acr/backups/`:

```bash
# List all previous operations
acr split history

# Inspect details of a specific operation
acr split history 20260911T143012Z-a4f82c

# JSON format
acr split history --format json
```

### 5. Manual Rollback (`acr split rollback`)

Revert an applied split operation to its exact pre-split state:

```bash
# Interactive rollback
acr split rollback 20260911T143012Z-a4f82c

# Non-interactive rollback
acr split rollback 20260911T143012Z-a4f82c --yes

# JSON output
acr split rollback 20260911T143012Z-a4f82c --yes --format json
```

### Safety & Invariants

* **`automatic-ready`**: Clean, self-contained extraction with resolved dependencies, valid syntax, and no circular imports. Only `automatic-ready` candidates can be applied.
* **`manual-review`**: Valid preview constructed, but developer review is required (e.g. nested closures capturing mutable state). **`--apply` is rejected**.
* **`blocked`**: Unsafe or incomplete transformation (e.g. conditional hook execution, target collision, unresolved bindings, circular imports). **`--apply` is rejected**.
* **Optimistic Concurrency**: If the source file changed after planning, application immediately aborts before any modification.
* **Transaction & Auto-Rollback**: Temporary files are written and parsed before atomic renaming. If post-write validation fails, original source is restored and target removed automatically.
* **Collision Protection**: Existing targets are never overwritten; rollbacks abort if source or target was modified by the user after splitting.
* **AI Provider Role**: When `--ai` is enabled, Groq/OpenAI is used only to improve candidate ranking, naming suggestions, and explanations. AI never controls disk writes or validation.

---

## Split Exit Codes

| Exit Code | Description |
| :--- | :--- |
| `0` | Success or interactive user cancellation before changes |
| `1` | Unexpected internal failure |
| `2` | Invalid CLI usage / candidate not found / operation not found |
| `3` | Unsafe or blocked transformation (`manual-review` or `blocked` on apply) |
| `4` | Confirmation required (non-interactive without `--yes`) |
| `5` | Source changed after planning (optimistic concurrency) or target file collision |
| `6` | Write or post-write validation failure |
| `7` | Rollback conflict (source or target modified after split) |
| `8` | Operation locked by concurrent ACR process |
| `130` | Process interrupted by user (`SIGINT` / `SIGTERM`) |

## Contributing


Contributions are welcome. If you find a bug, have an idea, or want to improve ACR, open an issue or submit a pull request.

- [Open an issue](https://github.com/Debdip2003/ai-code-reviewer/issues)
- [Read the contribution guide](https://github.com/Debdip2003/ai-code-reviewer/blob/main/.github/CONTRIBUTING.md)
- [Read the Code of Conduct](https://github.com/Debdip2003/ai-code-reviewer/blob/main/.github/CODE_OF_CONDUCT.md)
- [Report a security vulnerability privately](https://github.com/Debdip2003/ai-code-reviewer/security/advisories/new)

Please do not include API keys, credentials, private source code, or confidential information in public issues or pull requests.

## License

MIT License. Copyright (c) 2026 Debdip Bhattacharya.