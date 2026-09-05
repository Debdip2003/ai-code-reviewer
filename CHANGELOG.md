# Changelog

All notable changes to the **ACR (Autonomous Code Reviewer)** package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-06

### Added
- **Product Rebranding**: Rebranded product and CLI executable to `acr` under scoped package `@code/acr`.
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
