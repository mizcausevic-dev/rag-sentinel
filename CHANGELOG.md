# Changelog

All notable changes to this project are documented here.

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