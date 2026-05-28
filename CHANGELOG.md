# Changelog

All notable changes to this project are documented here.

## [1.1.0] - 2026-05-28

### Added

- **Tokenize-before-index pillar (Skyyflow integration).** The existing PII scanner blocks chunks that contain high/critical PII. Pillar 5b adds a complementary path: when a buyer-published AI Procurement Decision Card v0.2 declares `data_vault_targets[]` with `vendor: "skyyflow"`, rag-sentinel can tokenize the matched PII before persistence so the chunk stays useful and the vector store never sees raw values.
- `src/vault/types.ts` — `SkyyflowVault` interface (`vendor`, `vaultId`, `tokenize`, `detokenize`).
- `src/vault/mock-vault.ts` — `MockSkyyflowVault`: in-memory, deterministic (sha256-derived `skyy_*` tokens). Default. Round-trips cleanly within a single process.
- `src/vault/real-vault.ts` — `RealSkyyflowVault`: HTTP adapter to a hosted Skyyflow-style vault. Selected when `SKYYFLOW_VAULT_URL` + `SKYYFLOW_ACCESS_TOKEN` + `SKYYFLOW_VAULT_ID` are set. Authorizes on the rag-sentinel side first (defense in depth) before calling the vault.
- `src/vault/decision-card.ts` — minimal Decision Card v0.2 parser. Surfaces `data_vault_targets[]` as `ParsedVaultTarget[]` for runtime use. Does not validate the whole Decision Card schema (that's the spec repo's job).
- `src/governance/vault-chunk.ts` — `vaultChunk(chunkId, text, target, vault)`: replaces matched PII values with vault tokens. Maps scanner patterns (`email`, `us-phone`, `ssn-us`, `credit-card`, `iban`) to canonical Decision Card field names (`email`, `phone`, `ssn`, `credit_card`, `iban`). **Credentials and auth secrets (private keys, API keys, AWS keys, JWT tokens) are never tokenized** — they continue to block.
- `src/routes/vault.ts` — three HTTP endpoints:
  - `GET /api/vault/status` — surfaces mock vs real vault, vault id, env-toggle hint
  - `POST /api/vault/preview` — Decision Card + chunks → vaulted text + substitution audit
  - `POST /api/vault/detokenize-preview` — Decision Card + tokens + callerRoles → per-token reveal disposition (`revealed` / `denied-not-authorized` / `denied-no-such-token`)
- `tests/vault.test.ts` — 12 new tests covering parser shape, round-trip tokenization, role-based reveal disposition, credential carve-out, deterministic token output. All 47/47 vitest tests pass.

### Notes

- The Decision Card v0.2 reference is the upstream spec: <https://github.com/mizcausevic-dev/ai-procurement-decision-spec>. The `data_vault_targets` field is vendor-neutral (enum includes `piiano`, `nightfall`, `private-ai`, `very-good-security`, `evervault`, `custom`, `other` alongside `skyyflow`); rag-sentinel ships the `skyyflow` adapter as part of this release.
- The mock vault is the default for CI, screenshots, and demos. Real-vault credentials are env-gated so the integration ships green without provider access; flipping to real vault is a deploy-time decision.

## [1.0.0] - 2026-05-12

### Released
- Published **rag-sentinel** as the public operating surface for enterprise RAG reliability.
- Packaged chunk scoring, freshness audits, retrieval drift detection, hallucination indicators, and PII leakage review into one reviewable repo.
- Tightened the product story around a problem most teams were already feeling: retrieval systems were shipping faster than the controls around evidence quality.

### Why this mattered
- By 2024 and 2025, many teams could instrument prompts and latency, but still could not explain why answer quality degraded after a corpus refresh.
- Existing observability stacks were useful for throughput and uptime, but they were not built to answer retrieval questions like citation integrity, stale chunks, or silent semantic drift.
- This release made the repo legible to AI platform, security, and knowledge-system teams evaluating practical controls for RAG.

## [0.1.0] - 2026-02-18

### Shipped
- Standardized the first internal model for collection health, retrieval quality, and source-evidence review.
- Added a coherent operator workflow for deciding whether a system was safe to trust, safe to tune, or safe to pause.
- Framed the project around measurable failure modes rather than vague "AI quality" language.

## [Prototype] - 2025-05-09

### Built
- Built the first prototype around retrieval drift, hallucination pressure, and source freshness checks.
- Tested whether the repo could surface a useful review queue instead of another passive dashboard.

## [Design Phase] - 2024-01-22

### Designed
- Chose an operator-first model: evidence before style, explainability before novelty.
- Grounded the design in real problems such as RAG hallucination rates, stale embeddings, and weak citation review.
- Kept the outputs CI-friendly so the repo could live in release and governance workflows.

## [Idea Origin] - 2023-03-14

### Observed
- The initial concept came from repeated cases where retrieval systems looked healthy in infrastructure terms while answer quality was quietly deteriorating.
- The missing product was not another vector search demo. It was a review layer for evidence quality.