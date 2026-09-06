# Security Policy

The security of **ACR (Autonomous Code Reviewer)** (`@debdipbhat/acr`) and the projects analyzed by it is taken seriously.

---

## Supported versions

We provide security updates and patches for the following versions of ACR:

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older releases | Best effort |

We strongly recommend always running the latest published release of `@debdipbhat/acr` from npm.

---

## Reporting a vulnerability

Please **do not** open public GitHub issues, discussions, or pull requests for suspected security vulnerabilities. Public disclosure could expose users to risk before a fix is available.

Instead, please submit a private vulnerability report via GitHub Security Advisories:

👉 **[Submit a Private Security Advisory](https://github.com/Debdip2003/ai-code-reviewer/security/advisories/new)**

This private reporting channel ensures that the report is only visible to project maintainers.

---

## What to include

To help us investigate and triage the issue efficiently, please include as much relevant detail as possible:

* **Affected ACR version**: The exact version of `@debdipbhat/acr` where the issue was observed.
* **Vulnerability description**: A detailed explanation of the vulnerability, attack vector, or unintended behavior.
* **Reproduction steps**: Step-by-step instructions or a minimal, sanitized proof-of-concept repository/script.
* **Potential impact**: An assessment of what an attacker could achieve (e.g., secret leakage, unintended command execution, cache poisoning).
* **Suggested mitigation**: Any proposed fix, patch, or workaround, if known.

---

## What not to include

Please protect your own privacy and sensitive information. In your report, **do not include**:

* Real or active API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`, etc.)
* npm publishing tokens or GitHub personal access tokens
* Real credentials, passwords, or authentication secrets
* Proprietary, non-public source code or customer data
* Unnecessary personal data

When providing reproduction examples, please use placeholder tokens (such as `gsk_example_key_123` or `sk-example-dummy-key`).

---

## Response process

1. **Acknowledgment & Review**: Reports will be reviewed as availability permits, and the maintainer will communicate next steps through the private advisory.
2. **Investigation**: The maintainer will investigate the issue, reproduce the reported behavior, and determine appropriate mitigations.
3. **Patching & Release**: Once resolved, a patched version will be published to npm under `@debdipbhat/acr`, and a coordinated security advisory will be published on GitHub.
