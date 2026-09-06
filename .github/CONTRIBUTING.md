# Contributing to ACR

Thank you for your interest in contributing to **ACR (Autonomous Code Reviewer)** (`@debdipbhat/acr`)! ACR is an open-source, terminal-first JavaScript and React code reviewer designed to deliver deterministic static analysis, complexity metrics, React inspections, and AI insights.

We welcome contributions from developers of all backgrounds and experience levels.

---

## Ways to contribute

You can contribute to ACR in many ways:

* **Report bugs**: Identify reproducible unexpected behavior, false positives, or crashes.
* **Suggest features**: Propose improvements to the CLI experience, configuration, or review rules.
* **Improve documentation**: Clarify instructions, add examples, or fix typos in guides and README.
* **Add test cases**: Expand unit, integration, or end-to-end test coverage.
* **Fix analyzer behavior**: Improve precision and performance in Babel AST parsing or ESLint integration.
* **Improve JavaScript or React support**: Enhance React Hook analysis, JSX inspections, or modern ECMAScript features.
* **Improve Groq integration**: Enhance prompt construction, token estimation, model support, and JSON schema parsing.
* **Improve terminal output**: Polish chalk color schemes, summary tables, spinner responsiveness, or JSON reporting.
* **Improve performance or caching**: Optimize file scanning, AST traversal, or content-addressed caching mechanisms.

---

## Before you start

* **Search existing issues**: Before creating a new issue or writing code, check the [issue tracker](https://github.com/Debdip2003/ai-code-reviewer/issues) to see if the topic is already being discussed.
* **Discuss major changes**: For significant features or architectural changes, please open an issue first to discuss the design and align with project maintainers.
* **Scope boundaries**: Code-splitting functionality belongs to the future **V2 scope** and should be discussed in an issue before implementation.
* **No direct pushes**: Contributors must not push directly to the `main` branch. All code changes must be submitted through a pull request.

---

## Reporting bugs

If you find a bug:

1. Check existing [GitHub Issues](https://github.com/Debdip2003/ai-code-reviewer/issues) to avoid duplicate reports.
2. Open a new report using the [Bug report issue form](https://github.com/Debdip2003/ai-code-reviewer/issues/new?template=bug-report.yml).
3. Include:
   * ACR, Node.js, and npm versions.
   * Operating system and installation method.
   * Exact sanitized command executed.
   * Expected vs. actual behavior.
   * Minimal sanitized code snippet reproducing the issue.
   * Relevant sanitized logs or terminal output.
4. **Security Notice**: Never paste `GROQ_API_KEY`, `OPENAI_API_KEY`, npm tokens, credentials, private repository code, or customer data into public issues.

---

## Suggesting features

To propose an enhancement:

1. Check existing [GitHub Issues](https://github.com/Debdip2003/ai-code-reviewer/issues) to see if the feature has already been suggested.
2. Open a feature request using the [Feature request issue form](https://github.com/Debdip2003/ai-code-reviewer/issues/new?template=feature-request.yml).
3. Provide:
   * The problem you are experiencing and why current functionality is insufficient.
   * Proposed solution and example CLI syntax or configuration.
   * Alternatives considered.
4. Note that submitting a feature request does not guarantee immediate implementation; proposals are prioritized based on roadmap alignment and maintainer capacity.

---

## Development setup

### Prerequisites

* **Node.js**: `>= 20.0.0`
* **npm**: `>= 10.0.0`
* **Git**

### Clone and Install

Fork the repository on GitHub, then clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/ai-code-reviewer.git
cd ai-code-reviewer
npm ci
```

> **Note:** Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Creating a branch

Always create a new branch from `main` for your work with a descriptive prefix:

```bash
git checkout -b feat/short-description
```

### Branch naming conventions

* `feat/short-description` – New features or analyzer capabilities
* `fix/short-description` – Bug fixes and corrections
* `docs/short-description` – Documentation improvements
* `test/short-description` – Adding or updating test suites
* `refactor/short-description` – Code refactoring without behavioral changes
* `chore/short-description` – Toolchain, packaging, or dependency maintenance

---

## Making changes

* **Stay focused**: Keep pull requests focused on a single concern or feature. Avoid combining unrelated changes.
* **Maintain documentation**: Update `README.md` and docstrings whenever you introduce or modify user-facing options, commands, or behaviors.
* **Preserve existing fixtures**: Reviewed test fixture files must not be unexpectedly modified unless the test is intentionally updated.
* **Zero secrets**: Never commit API keys, npm tokens, credentials, proprietary code, private repository contents, or customer data.

---

## Testing changes

ACR maintains a comprehensive automated test suite. Before submitting your pull request, run all verification checks locally:

### Required verification checks

```bash
# Run unit and integration test suite
npm test

# Verify CLI binary entry point and help output
npm run check

# Validate package metadata and pre-release requirements
npm run release:check

# Dry-run package archive creation
npm run pack:dry-run
```

### Additional verification tools

```bash
# Run tests in watch mode during development
npm run test:watch

# Run isolated consumer smoke test with packaged tarball
npm run test:package

# Audit production dependencies for security vulnerabilities
npm run audit:prod
```

---

## Submitting a pull request

1. Commit your changes following the [Commit-message guidance](#commit-message-guidance).
2. Push your branch to your GitHub fork:
   ```bash
   git push -u origin feat/short-description
   ```
3. Navigate to [https://github.com/Debdip2003/ai-code-reviewer](https://github.com/Debdip2003/ai-code-reviewer) and click **New Pull Request**.
4. Fill out the [Pull Request Template](pull_request_template.md) completely, detailing:
   * Summary of changes.
   * Reason for change.
   * Linked issue (`Closes #123`).
   * How the changes were tested.
5. Ensure all continuous integration (CI) workflows pass.

---

## AI-provider guidelines

When contributing code related to AI providers (Groq or OpenAI):

* **Bring-Your-Own-Key (BYOK)**: API keys are strictly loaded from environment variables (`GROQ_API_KEY`, `OPENAI_API_KEY`) or local `.env` files. Never allow API keys in CLI arguments or serialized configuration files.
* **No live network calls in tests**: Automated tests must **never** make real network requests to Groq or OpenAI APIs. Use Vitest mocks and fixture responses.
* **Sanitize error messages**: Ensure any network errors, status codes, or provider exceptions scrub API keys and sensitive tokens before printing to the terminal or JSON report.
* **Fallback resilience**: Ensure graceful degradation when network timeouts occur or token limits are reached.

---

## Security and privacy

* **Never commit secrets**: Check your diffs (`git diff`) before committing to ensure no `.env` files, API keys, or private tokens are included.
* **Report vulnerabilities privately**: Do **not** open public issues for security vulnerabilities. Please submit reports through GitHub's private security advisory page:  
  [https://github.com/Debdip2003/ai-code-reviewer/security/advisories/new](https://github.com/Debdip2003/ai-code-reviewer/security/advisories/new)

---

## Commit-message guidance

We encourage clear, descriptive commit messages adhering to standard conventional prefixes:

### Examples

* `feat: add configurable React rule`
* `fix: prevent duplicate AI findings`
* `docs: explain Groq configuration`
* `test: cover changed-line filtering`
* `refactor: extract AST helper functions`
* `chore: update release check validation`

---

## Code of Conduct

This project and everyone participating in it is governed by the [ACR Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior through the maintainer's contact methods at [https://github.com/Debdip2003](https://github.com/Debdip2003).
