# Why RAG Sentinel exists

A retrieval pipeline can produce fluent answers while its source material is stale, poorly chunked, or exposed to sensitive-data leakage. RAG Sentinel collects several checks for those risks in one reference API so an operator can inspect the signals and decide what to investigate next.

The repository currently includes deterministic scoring functions, HTTP validation routes, bundled collection fixtures, and an experimental vault preview. It does not connect to a vector database, monitor a deployed RAG system, or prove that an answer is factually correct. The grounding score is a heuristic signal; the PII scanner is pattern-based and may miss values.

The next product step is an evidence-backed integration with a real index and a documented decision workflow. Until then, the useful artifact is a reviewable set of checks and tests, not a claim of enterprise coverage.
