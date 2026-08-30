## Summary

Prepare Qarar for public open-source collaboration and maintainer programs.

### Changes

- Add Apache License 2.0.
- Add Arabic contribution guidelines.
- Add a responsible security disclosure policy.
- Add Contributor Covenant Code of Conduct.
- Replace the documentation-only README with a product-focused README that reflects the implemented platform.
- Document current capabilities, architecture, local setup, tests, roadmap, target users, and contribution flow.
- Add an honest screenshots section without mock or broken images.

## Why

The repository has evolved from a documentation foundation into an actively maintained governance platform. Its public documentation and community files should reflect the implemented codebase and provide clear expectations for contributors and security researchers.

## Validation

- Reviewed commands against root `package.json`.
- Reviewed environment setup against `supabase/docker/.env.example`.
- Avoided claiming the administration dashboard is merged; PR #126 is referenced as active work.
- No runtime code or database migrations changed.

## Review notes

Before merging, confirm that the organization owns the rights required to publish all included code and documentation under Apache License 2.0.
