# RAG Sentinel

[![Live demo: RAG Injection Scanner](docs/demo-preview.png)](https://ragscan.kineticgain.com)

**Related live demo:** [RAG Injection Scanner](https://ragscan.kineticgain.com) is a separate browser tool. Its current data-flow behavior has not been verified as part of this repository's tests.


[![CI](https://github.com/mizcausevic-dev/rag-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/mizcausevic-dev/rag-sentinel/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-66FCF1)](LICENSE)

A reference API for RAG governance checks: chunk quality scoring, source freshness audits, retrieval drift comparison, heuristic grounding signals, and sensitive-content scanning. It operates on caller-supplied data and bundled fixtures. No vector database connector, persistent collection history, production tenant isolation, or production identity system is included.

**Release status:** Local evaluation prototype. The API must not be exposed as a multi-tenant or student-data service without verified authentication, provider contracts, retention controls, and operational testing.

> **What this repo proves**
>
> RAG reliability is not just a model-quality problem. It is an evidence, retrieval, and governance problem, and this repo treats it that way.

## Why This Exists

RAG failures can start in retrieval. Stale documentation can contradict current product behavior. Chunks can start mid-sentence and degrade relevance. API keys can be accidentally indexed into a vector store. Top-K results can shift after an embedding model upgrade. These risks motivate checks before customers rely on the answers.

RAG Sentinel provides functions and HTTP endpoints that a team can call during indexing or answer evaluation. The bundled collections and dashboard are illustrative fixtures. The API does not watch a live vector store on its own.

## Where This Sits in the Portfolio

| Repo | Surface | Question it answers |
|---|---|---|
| [`mcp-sentinel`](https://github.com/mizcausevic-dev/mcp-sentinel) | Tool calls | *What MCP tools are exposed and how risky are they?* |
| **rag-sentinel** | **Retrieval** | ***What do caller-supplied chunks and retrieval snapshots reveal?*** |
| [`agent-codex`](https://github.com/mizcausevic-dev/agent-codex) | Decisions | *Under what policies are decisions allowed?* |
| [`agentobserve`](https://github.com/mizcausevic-dev/agentobserve) | Runtime | *What did agents actually do â€” cost, latency, outcomes?* |
| [`kinetic-flightdeck`](https://github.com/mizcausevic-dev/kinetic-flightdeck) | Operator | *Are we OK right now? Who do I call?* |

## Project Overview

| Attribute | Detail |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Domain | RAG governance reference API and demo fixtures |
| Validation Areas | Chunk quality Â· Source freshness Â· Retrieval drift Â· Hallucination signals Â· PII/sensitive content |
| Operational Outputs | Per-chunk scores Â· fixture-based collection posture Â· drift comparisons Â· sensitive-content signals |
| Docs | README and TypeScript route definitions; no generated OpenAPI contract |

## Five Governance Pillars

### 1. Chunk Quality Scoring

Bad chunks lead to bad retrievals. Scored at index time:
- Token count posture (too small loses context, too large exceeds embedding context)
- Sentence boundary respect (chunks should not start/end mid-sentence)
- Metadata completeness (source, title, last_updated minimum)
- Boilerplate detection (low lexical diversity flagged)
- Empty/whitespace content protection

### 2. Source Freshness Audit

Stale RAG content is the silent killer. Bucket distribution + weighted score:
- `fresh` (â‰¤30 days, weight 100)
- `aging` (31â€“90 days, weight 75)
- `stale` (91â€“365 days, weight 30)
- `ancient` (>365 days, weight 0)

### 3. Retrieval Drift Detection

Same query returning different results over time. Compares two retrieval snapshots:
- Top-K overlap ratio
- Spearman-style rank correlation
- New / dropped chunk identification
- Embedding-model-change detection (drift expected, validation required)

Drift levels: `minimal` Â· `moderate` Â· `significant` Â· `severe`

### 4. Hallucination Signals

Heuristic grounding analysis on RAG answers:
- Citation coverage (% of substantive claims with attribution)
- Source-claim alignment (do quoted snippets actually appear in retrieved sources?)
- Ungrounded number/date generation
- Refusal recognition (refusing with no relevant sources is a positive signal)
- Empty-retrieval-with-non-empty-answer guard

### 5. PII / Sensitive Content Scanning

Catches leakage before it ends up in retrieval results:
- Private key blocks (PEM)
- API/secret key prefixes (sk-, pk-, sk-proj-, etc)
- AWS access keys (AKIA pattern)
- JWT tokens
- SSN, credit card, IBAN
- Emails and US phone (low-severity awareness)

Severity-weighted blocking decision: `critical` and `high` hits trigger automatic block.

### 5b. Tokenize-before-index preview (experimental Skyyflow-style adapter)

The blocking model above answers *"is this content safe to index?"* The Skyyflow vault integration answers a different question: *"can this content be **made** safe to index by replacing the PII with tokens?"*

When the caller supplies an [AI Procurement Decision Card v0.1-v0.3](https://github.com/mizcausevic-dev/ai-procurement-decision-spec) that lists `data_vault_targets[]` with `vendor: "skyyflow"`, the preview endpoint:

1. Replaces detected, authorized PII values (email, phone, SSN, credit card, IBAN, never credentials or auth secrets) with tokens and returns a candidate chunk for an operator to review. If a recognized field is unauthorized, the request makes no vault call and returns `shouldBlock: true` with `vaultedText: null`. A recognized sensitive value remaining after tokenization also blocks the candidate. The caller remains responsible for deciding whether to index an unblocked candidate. Pattern matching is heuristic and does not prove all PII is removed.
2. Supports a local mock-only detokenization preview. Caller-supplied `callerRoles` are rejected; demo roles come from the server-side principal. The HTTP endpoint refuses real-vault reveal. There is no audit-event pipeline or production query-time integration.

The server binds each configured API principal to a tenant ID, vault ID allowlist, permitted fields, and roles. Vault preview requires the `vault-tokenize` role, a matching configured vault and field set, and a Decision Card that declares an unexpired `approved` status. Conditional approvals are denied because this preview cannot evaluate their conditions. This preview accepts only exact canonical field names (`email`, `phone`, `ssn`, `credit_card`, `iban`); nested field paths are denied because the scanner cannot bind each detected value to a specific path. The Decision Card is supplied by the caller and its origin or signature is **not** verified. It is an additional declaration check, not a source of authorization or proof of procurement approval. Only a separately trusted buyer record can establish that approval. The real adapter uses one globally configured vault, so this is not a verified multi-tenant service.

Two vault implementations ship in the box:

| Implementation | When it's selected | Notes |
|---|---|---|
| `MockSkyyflowVault` | Explicit loopback-only local demo | Deterministic in-memory tokens. Use synthetic input only. Predictable tokens are unsuitable for real PII. |
| `RealSkyyflowVault` | When all three `SKYYFLOW_*` variables are set | Experimental HTTPS adapter for tokenization. The assumed provider API contract and token refresh have not been verified against a live Skyyflow tenant. Real-vault detokenization is disabled at the HTTP boundary. |

Credentials and auth secrets (private keys, AWS access keys, JWT tokens, API keys) are **never tokenized** — they continue to block the chunk regardless of Decision Card target. That distinction is intentional: tokenizing a credential just makes it slightly harder to find while shipping it into a vector store anyway.

Three HTTP endpoints expose the integration:

```
GET  /api/vault/status                      mock vs real vault, vault id, env-toggle hint
POST /api/vault/preview                     decisionCard + chunks → vaulted text + substitution audit
POST /api/vault/detokenize-preview          local mock only; decisionCard + tokens → preview disposition
```

Example — `POST /api/vault/preview`:

```jsonc
// Request
{
  "decisionCard": { /* a Decision Card v0.1-v0.3 with decision.status="approved" and a matching target */ },
  "chunks": [
    { "chunkId": "c1", "text": "Contact jane@example.com; SSN 123-45-6789 on file." }
  ]
}

// Response (mock vault, truncated tokens for readability)
{
  "decisionId": "DEMO-1",
  "decisionCardVersion": "0.3",
  "vaultVendor": "skyyflow",
  "vaultMode": "mock",
  "vaultId": "mock-vault-001",
  "fieldsAuthorized": ["email", "ssn"],
  "revealRoles": ["demo-operator"],
  "chunks": [
    {
      "chunkId": "c1",
      "vaultedText": "Contact skyy_c845…; SSN skyy_277a… on file.",
      "substitutions": [
        { "patternName": "email",  "token": "skyy_c845…", "field": "email" },
        { "patternName": "ssn-us", "token": "skyy_277a…", "field": "ssn"   }
      ],
      "unauthorizedHits": [],
      "shouldBlock": false
    }
  ]
}
```

## Composite Posture Methodology

| Pillar | Weight | Rationale |
|---|---|---|
| Sensitive content | 0.25 | Leakage is binary; one critical hit blocks |
| Hallucination | 0.25 | Grounding is the user-facing trust contract |
| Freshness | 0.20 | Stale content silently degrades retrieval |
| Chunk quality | 0.15 | Index-time investment |
| Retrieval drift | 0.15 | Detected stability of the surface |

Override logic: a single critical signal (PII crisis, freshness crisis, hallucination crisis) **forces blocked status** regardless of composite â€” the same "platform thinking" doctrine used in `mcp-sentinel` and `kinetic-flightdeck`.

## API Endpoints

### Read

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service status and uptime |
| GET | `/api/collections` | List registered RAG collections |
| GET | `/api/collections/:id` | Single collection metadata + metrics |
| GET | `/api/collections/:id/posture` | Composite posture score for collection |
| GET | `/api/incidents` | Filtered incident feed (collectionId, severity, status, category) |
| GET | `/api/vault/status` | Configured vault mode and vault ID when authorized for that vault |
| POST | `/api/vault/preview` | Active Decision Card v0.1-v0.3 + authorized chunks → vaulted text + substitution preview |
| POST | `/api/vault/detokenize-preview` | Active Decision Card v0.1-v0.3 + tokens → local mock reveal disposition using server-side roles |
| GET | `/api/dashboard/summary` | Operator headline view |

### Validate

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/validate/chunks` | Score a batch of chunks at index time |
| POST | `/api/validate/freshness` | Audit a collection's source freshness |
| POST | `/api/validate/drift` | Compare two retrieval snapshots |
| POST | `/api/validate/answer` | Evaluate an answer for hallucination signals |
| POST | `/api/validate/pii-scan` | Scan a chunk batch for sensitive content |

## Sample: Hallucination Evaluation

```json
POST /api/validate/answer
{
  "answerText": "The system uses Diffie-Hellman key exchange. This was confirmed in the 2024 audit.",
  "citationsClaimed": [
    { "sourceId": "s1", "quote": "Diffie-Hellman key exchange used since 2019" }
  ],
  "retrievedSources": [
    { "sourceId": "s1", "text": "The cryptographic stack uses RSA-2048 for transport." }
  ]
}
```

```json
{
  "groundingScore": 25,
  "citationCoverage": 50,
  "signals": [
    "1 citation(s) reference content not in retrieved sources.",
    "1 numeric/date claim(s) not present in retrieved sources: 2024."
  ],
  "unsupportedCitations": [
    { "sourceId": "s1", "quote": "Diffie-Hellman key exchange used since 2019" }
  ],
  "recommendedNextAction": "Block answer from production output; investigate retrieval quality and prompt grounding instructions."
}
```

## Sample: PII Scan

```json
POST /api/validate/pii-scan
{
  "chunks": [
    { "chunkId": "c_429", "text": "Use sk-proj-AbCdEf1234567890XyZpQrStUvWxYz123456 to authenticate." }
  ]
}
```

```json
{
  "totalChunks": 1,
  "flaggedChunks": 1,
  "blockedChunks": 1,
  "hitsBySeverity": { "critical": 1, "high": 0, "medium": 0, "low": 0 },
  "hitsByPattern": { "api-key-prefix": 1 },
  "perChunk": [
    {
      "chunkId": "c_429",
      "hits": [
        {
          "patternName": "api-key-prefix",
          "severity": "critical",
          "description": "API/secret key with conventional prefix detected.",
          "matchedSnippet": "sk-p****56"
        }
      ],
      "highestSeverity": "critical",
      "shouldBlock": true
    }
  ]
}
```

## Operator Console Preview

![RAG Sentinel operator console â€” KPIs, collection posture, retrieval drift, freshness, and incident timeline](docs/hero.png)

The image and [`dashboard-preview/index.html`](dashboard-preview/index.html) are static synthetic illustrations. Their collection counts, incidents, production labels, and dates are not live operational evidence.

## Getting Started

### Prerequisites

- Node.js 22.20+ or 24.12+ (maintained LTS lines targeted by CI)
- npm

### Setup

```powershell
git clone https://github.com/mizcausevic-dev/rag-sentinel.git
cd rag-sentinel
npm ci
$env:RAG_SENTINEL_API_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:RAG_SENTINEL_LOCAL_DEMO = 'true'
npm run dev
```

From a shell with the same API key, check:

```powershell
curl.exe http://127.0.0.1:3000/health
curl.exe -H "x-api-key: $env:RAG_SENTINEL_API_KEY" http://127.0.0.1:3000/api/dashboard/summary
```

The server binds to `127.0.0.1` by default. This explicit local demo requires a random `RAG_SENTINEL_API_KEY` of at least 32 characters and cannot start in production or with real Skyyflow settings. A reverse proxy can expose loopback services, so keep this demo off public networks. Requests to `/api/*` require its `x-api-key` header; the health endpoint remains public. Browser CORS access is disabled. Do not send real learner data to the mock vault. This repository is marked private for npm and has no public npm installation path.

For a non-demo service, provision `RAG_SENTINEL_PRINCIPALS_JSON` through a secret manager as a JSON array of records with `id`, `tenantId`, `apiKey` (at least 32 characters), `roles`, `vaultIds`, and `fieldsAuthorized`. The `vault-tokenize` role is required for preview. Each vault ID may belong to only one tenant; `SKYYFLOW_VAULT_ID` must match the authorized principal and Decision Card target. Do not combine principal mode with the local demo variables. The principal mapping controls the preview endpoint but does not isolate the bundled synthetic collections or establish an end-user identity system. Verify the real provider contract, tenant-specific vault policy, credential lifecycle, retention, audit logging, and deployment boundary before processing personal data.

### Run Tests

```bash
npm test
```

Local tests cover chunk quality, freshness, retrieval drift, grounding heuristics, PII patterns, vault tokenization, principal authorization, API key enforcement, and real-vault reveal denial. Coverage percentage has not been measured.

## What This Demonstrates

- RAG governance checks exposed as testable functions and endpoints
- Heuristic-but-defensible analysis of grounding without requiring LLM calls in the loop
- Composite scoring that respects platform-engineering doctrine (sensitive content + hallucination dominate)
- Override logic â€” a single critical signal blocks regardless of good composites
- Validation endpoints that can be integrated into indexing and answer pipelines
- Strict-mode TypeScript; CI matrix on Node 22 + 24

## Future Enhancements

- Real-time polling agent for vector stores (Pinecone, Qdrant, Weaviate, pgvector)
- LLM-based grounding cross-check (heuristics + judge model)
- Streaming chunk validation for ingestion pipelines
- Per-collection scoring history with PostgreSQL + Grafana
- Alert routing to PagerDuty, Slack, and SIEMs
- Multi-tenant control plane for managed-service deployment

## Tech Stack

- Node.js, TypeScript, Express, Zod
- Helmet
- Node test runner

## Portfolio Links

- [LinkedIn](https://www.linkedin.com/in/mizcausevic/)
- [Skills Page](https://mizcausevic.com/skills)
- [Medium](https://medium.com/@mizcausevic)
- [GitHub](https://github.com/mizcausevic-dev)

Part of [mizcausevic-dev's GitHub portfolio](https://github.com/mizcausevic-dev) â€” AI Platform Engineering quintet.

---

**Connect:** [LinkedIn](https://www.linkedin.com/in/mirzacausevic/) Â· [Kinetic Gain](https://kineticgain.com) Â· [Medium](https://medium.com/@mizcausevic/) Â· [Skills](https://mizcausevic.com/skills/)
