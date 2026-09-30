# Changelog

This file records source changes. The version in `package.json` does not establish npm publication or production deployment.

## Unreleased review changes

- Bind the service to loopback by default. Serving HTTP in any environment now requires a shared `RAG_SENTINEL_API_KEY` of at least 32 characters; `/api/*` requests require its `x-api-key` header.
- Remove permissive CORS and query-string logging. Mark the package private and remove unused HTTP dependencies.
- Tokenize all distinct detected PII values in a chunk and fail closed on residual recognized sensitive content. Reject malformed vault responses and partial real-vault configuration.
- Limit detokenization preview to the local mock vault. Real-vault HTTP reveal now returns 403 until verified caller identity and role controls exist. Production mock preview now returns 503.
- Require explicit local-demo opt-in, or server-configured API principals bound to tenant, vault, fields, and roles. Reject caller-supplied reveal roles, cross-tenant vault targets, inactive Decision Cards, and unauthorized vault status requests. The card remains an unverified caller declaration, and real provider use remains an experimental gate.
- Withhold `vaultedText` whenever recognized sensitive content remains, including unapproved low-severity PII, so blocked preview results cannot be accidentally indexed as candidate text.
- Detect parenthesized US phone numbers after ordinary whitespace or at the start of a chunk; the previous word-boundary pattern missed these common positions.
- Pin OpenSSF Scorecard Action v2.4.4, whose GHCR image replaces the retired GCR image that caused scheduled scans to fail before checkout.
- Update transitive dependencies, tests, and docs. These HTTP boundary changes can require client configuration updates.

## Observed source milestones

- 2026-05-07: initial five-pillar RAG checks.
- 2026-05-28: experimental vault adapter and Decision Card parser, source version 1.1.0.
- 2026-08-05: public demo link and additional CI security workflows.
