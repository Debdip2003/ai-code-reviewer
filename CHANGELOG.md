# Changelog

All notable changes to the **ACR (Autonomous Code Reviewer)** package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Code Splitter Phase 2: Transformation Preview (`acr split <file> --candidate <id> [--preview]`)**: Exact, validated in-memory transformation preview for extracting a selected candidate into a target file without writing or mutating source files on disk.
- **Transformation Planner & Orchestrator (`src/splitter/transformation-planner.js`)**: Coordinates boundary contract planning, dependency placement, prop injection, import/export calculation, AST preview generation, parse verification, and cycle detection.
- **Candidate Boundary Contracts (`src/splitter/extraction-contract.js`)**: Formulates exact extraction contracts detailing moved declarations, captured bindings, props, parameter signatures, required imports, and target exports.
- **React Props & Parameter Planner (`src/splitter/prop-planner.js`)**: Analyzes captured outer bindings and maps them to React component props or function arguments, supporting automated callback handler renaming (`handleX` -> `onX`) and JSX call site generation.
- **Dependency Placement Planner (`src/splitter/dependency-placement.js`)**: Partitions file declarations into exclusive dependencies (moved to target) versus shared dependencies (retained and imported).
- **Import & Export Planners (`src/splitter/import-planner.js`, `src/splitter/export-planner.js`)**: Computes exact ES module imports and exports with POSIX relative path calculation, specifier filtering, and source re-export preservation.
- **Project Module Graph & Cycle Detector (`src/splitter/module-graph.js`, `src/splitter/cycle-detector.js`)**: Constructs local project module graphs and uses DFS to detect circular import dependencies before proposing file splits.
- **In-Memory Preview Generator (`src/splitter/preview-generator.js`)**: Generates AST-derived code previews for proposed `CREATE <target>` and `UPDATE <source>` files using `@babel/generator`.
- **Transformation Plan Schema & Error Hierarchy (`src/splitter/transformation-plan-schema.js`, `src/splitter/split-errors.js`)**: Comprehensive Zod schema validation and 8 typed domain error classes for split failures (`CandidateNotFoundError`, `UnsafeExtractionError`, `TargetCollisionError`, `TargetOutsideProjectError`, `UnresolvedBindingError`, `CircularDependencyError`, `PreviewGenerationError`, `TransformationValidationError`).
- **Stable Candidate IDs & Safety Classifications (`src/splitter/candidate-detector.js`)**: Deterministic kebab-case candidate IDs (`user-card`, `use-user-search`, `format-date-2`) and 3-tier safety ratings (`automatic-ready`, `manual-review`, `blocked`).
- **Enhanced Split CLI & Outputs (`src/cli/commands/split.js`, `src/cli/output/split-terminal.js`, `src/cli/output/split-json.js`)**: Added `--candidate`, `--target`, and `--preview` options, rich terminal formatting with diff-styled preview blocks, structured JSON output, and standard exit codes (0 = clean/automatic-ready, 1 = manual-review, 2 = blocked/error).
- **Experimental Code-Splitting Planner (`acr split <file>`)**: Read-only dry-run planner that analyzes JavaScript/React source files, constructs AST dependency graphs, detects extraction candidates across React components, custom hooks, utilities, services, and constant groups, validates proposed directory structures, and emits terminal or JSON plans without mutating source files.
- **AST Dependency Graph (`src/splitter/dependency-graph.js`)**: Tracks top-level declarations, imports, aliases, dependencies, reverse dependents, and captured closures using Babel scope analysis.
- **Target Path Resolution (`src/splitter/target-path.js`)**: Deterministically proposes repository-relative target filenames with traversal rejection and existing file conflict detection.
- **Strict Zod Plan Validation (`src/splitter/split-plan-schema.js` & `src/splitter/plan-validator.js`)**: Validates plan structure, mode (`dry-run`), line ranges, summary counts, and circular dependencies.
- **Optional AI Planning Integration**: Supports AI candidate ranking and architectural risk analysis via `--ai` using structured outputs.

## [0.1.0] - 2026-09-06


### Added
- **Product Rebranding**: Rebranded product and CLI executable to `acr` under scoped package `@debdipbhat/acr`.
- **Diagnostics**: Added `acr doctor [path]` command performing environment, Node.js, toolchain, configuration, and security readiness checks.
- **Graceful Cancellation**: Support for `AbortController` and `SIGINT`/`SIGTERM` signal propagation across AST parsing, Git operations, AI API calls, and review workflows with standard exit code `130`.
- **Centralized Exit Codes**:
  - `0`: Success (no findings at or above configured threshold)
  - `1`: Findings detected at or above configured threshold
  - `2`: Execution, parse, or configuration failure
  - `130`: Process interrupted by user (SIGINT/SIGTERM)
- **Monotonic Runtime Timing**: High-precision execution duration tracked via `performance.now()` across discovery, analysis, AI review, and output rendering.
- **Debug Logging**: Dedicated `--debug` flag writing sanitized, timestamped diagnostic logs strictly to `stderr` with zero secret exposure.
- **AI Privacy Banner**: Terminal-mode pre-flight privacy notice informing users of chunk transmission before outbound requests.
- **Git Changed-File Review**: Fast incremental reviews (`--changed`, `--base <ref>`) with line-intersection filtering.
- **Content-Addressed Local Cache**: SHA-256 hashed disk cache stored in `.acr-cache/` with cache invalidation and `acr cache clear` CLI command.
- **Pre-release & Packaging Validation**: Automated scripts for release validation (`scripts/release-check.js`) and tarball installation smoke testing (`scripts/test-package.js`).
