# Changelog

All notable changes to the **ACR (Autonomous Code Reviewer)** package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Experimental Code-Splitting Planner (`acr split <file>`)**: Read-only dry-run planner that analyzes JavaScript/React source files, constructs AST dependency graphs, detects extraction candidates across React components, custom hooks, utilities, services, and constant groups, validates proposed directory structures, and emits terminal or JSON plans without mutating source files.
- **AST Dependency Graph (`src/splitter/dependency-graph.js`)**: Tracks top-level declarations, imports, aliases, dependencies, reverse dependents, and captured closures using Babel scope analysis.
- **Candidate Detection & Safety Analysis (`src/splitter/candidate-detector.js`)**: Identifies candidates with conservative React component and hook detection, pure utility and service classification, and captures outer scope risks.
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
