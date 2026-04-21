# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in NaturalizationPuzzle, please report it privately. **Do not open a public issue.**

Use GitHub's **Private Vulnerability Reporting**:

1. Go to the repository's [Security tab](https://github.com/henrik-me/NaturalizationPuzzle/security).
2. Click **Report a vulnerability**.
3. Fill out the form with a clear description, reproduction steps, and the impact you expect.

You should receive an acknowledgement within a few days. We will work with you to understand the issue, develop a fix, and coordinate disclosure.

## Scope

In scope:

- The .NET API (`src/api/`) and its endpoints.
- The React PWA (`src/client/`), including the service worker and offline cache.
- The Docker image published to GHCR.
- The GitHub Actions CI/CD workflow.

Out of scope:

- Denial-of-service via traffic volume against any public deployment.
- Vulnerabilities in third-party dependencies that have already been disclosed upstream — please report those to the relevant project.
- Social engineering of maintainers.

## Supported Versions

Only the latest commit on the `main` branch is supported. Fixes are applied there and released as new container images.

## Data handling

This project stores no personal data server-side. All user preferences (selected state, study progress, quiz history) live exclusively in the browser's `localStorage`. The backend is a read-only source of civics question data.
