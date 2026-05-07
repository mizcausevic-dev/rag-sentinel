// Mock RAG collections representing what an enterprise AI platform team
// would govern in production. Each collection has metrics derived from the
// underlying analyzers; values reflect realistic posture signals.

export interface RagCollection {
  collectionId: string;
  name: string;
  domain: string;
  owner: string;
  ownerTeam: string;
  environment: 'production' | 'staging' | 'development';
  embeddingModel: string;
  vectorStore: string;
  chunkingStrategy: string;
  totalDocuments: number;
  totalChunks: number;
  registeredAt: string;
  metrics: {
    chunkQualityScore: number;
    averageChunkSize: number;
    semanticBoundaryRespect: number;
    metadataCoverage: number;
    freshnessScore: number;
    staleRatio: number;
    orphanedChunks: number;
    retrievalDriftScore: number;
    queriesAnalyzed: number;
    hallucinationScore: number;
    citationCoverage: number;
    contradictionRate: number;
    piiIncidents: number;
    sensitiveContentScore: number;
  };
}

export const collections: RagCollection[] = [
  {
    collectionId: 'col_support_kb',
    name: 'Customer Support Knowledge Base',
    domain: 'support',
    owner: 'support-eng',
    ownerTeam: 'support-engineering',
    environment: 'production',
    embeddingModel: 'text-embedding-3-large',
    vectorStore: 'pinecone',
    chunkingStrategy: 'recursive-1024',
    totalDocuments: 4250,
    totalChunks: 18800,
    registeredAt: '2026-01-12T10:00:00Z',
    metrics: {
      chunkQualityScore: 88,
      averageChunkSize: 850,
      semanticBoundaryRespect: 92,
      metadataCoverage: 96,
      freshnessScore: 82,
      staleRatio: 0.18,
      orphanedChunks: 24,
      retrievalDriftScore: 91,
      queriesAnalyzed: 12400,
      hallucinationScore: 86,
      citationCoverage: 78,
      contradictionRate: 0.02,
      piiIncidents: 3,
      sensitiveContentScore: 94,
    },
  },
  {
    collectionId: 'col_engineering_docs',
    name: 'Engineering Documentation',
    domain: 'engineering',
    owner: 'devx',
    ownerTeam: 'developer-experience',
    environment: 'production',
    embeddingModel: 'text-embedding-3-large',
    vectorStore: 'qdrant',
    chunkingStrategy: 'semantic-768',
    totalDocuments: 2120,
    totalChunks: 11200,
    registeredAt: '2026-02-04T10:00:00Z',
    metrics: {
      chunkQualityScore: 84,
      averageChunkSize: 720,
      semanticBoundaryRespect: 88,
      metadataCoverage: 90,
      freshnessScore: 76,
      staleRatio: 0.24,
      orphanedChunks: 45,
      retrievalDriftScore: 86,
      queriesAnalyzed: 8200,
      hallucinationScore: 81,
      citationCoverage: 72,
      contradictionRate: 0.04,
      piiIncidents: 12,
      sensitiveContentScore: 78,
    },
  },
  {
    collectionId: 'col_legacy_wiki',
    name: 'Legacy Confluence Mirror',
    domain: 'general',
    owner: 'platform-ops',
    ownerTeam: 'platform-ops',
    environment: 'production',
    embeddingModel: 'text-embedding-ada-002',
    vectorStore: 'weaviate',
    chunkingStrategy: 'fixed-512',
    totalDocuments: 8400,
    totalChunks: 22100,
    registeredAt: '2025-08-15T10:00:00Z',
    metrics: {
      chunkQualityScore: 52,
      averageChunkSize: 480,
      semanticBoundaryRespect: 58,
      metadataCoverage: 64,
      freshnessScore: 38,
      staleRatio: 0.62,
      orphanedChunks: 312,
      retrievalDriftScore: 64,
      queriesAnalyzed: 4200,
      hallucinationScore: 58,
      citationCoverage: 44,
      contradictionRate: 0.11,
      piiIncidents: 28,
      sensitiveContentScore: 55,
    },
  },
  {
    collectionId: 'col_sales_battlecards',
    name: 'Sales Battlecards & Competitive Intel',
    domain: 'sales',
    owner: 'revops',
    ownerTeam: 'revops',
    environment: 'production',
    embeddingModel: 'voyage-3',
    vectorStore: 'pgvector',
    chunkingStrategy: 'semantic-1024',
    totalDocuments: 380,
    totalChunks: 1820,
    registeredAt: '2026-03-22T10:00:00Z',
    metrics: {
      chunkQualityScore: 91,
      averageChunkSize: 940,
      semanticBoundaryRespect: 95,
      metadataCoverage: 98,
      freshnessScore: 88,
      staleRatio: 0.12,
      orphanedChunks: 4,
      retrievalDriftScore: 93,
      queriesAnalyzed: 1100,
      hallucinationScore: 84,
      citationCoverage: 80,
      contradictionRate: 0.03,
      piiIncidents: 1,
      sensitiveContentScore: 96,
    },
  },
  {
    collectionId: 'col_security_runbooks',
    name: 'SecOps Runbooks',
    domain: 'security',
    owner: 'secops',
    ownerTeam: 'security-operations',
    environment: 'production',
    embeddingModel: 'text-embedding-3-large',
    vectorStore: 'qdrant',
    chunkingStrategy: 'recursive-1024',
    totalDocuments: 620,
    totalChunks: 2840,
    registeredAt: '2026-02-28T10:00:00Z',
    metrics: {
      chunkQualityScore: 89,
      averageChunkSize: 880,
      semanticBoundaryRespect: 93,
      metadataCoverage: 100,
      freshnessScore: 91,
      staleRatio: 0.08,
      orphanedChunks: 2,
      retrievalDriftScore: 95,
      queriesAnalyzed: 620,
      hallucinationScore: 88,
      citationCoverage: 86,
      contradictionRate: 0.01,
      piiIncidents: 0,
      sensitiveContentScore: 100,
    },
  },
  {
    collectionId: 'col_finance_reports',
    name: 'Finance Reports & Filings',
    domain: 'finance',
    owner: 'finance-eng',
    ownerTeam: 'finance-engineering',
    environment: 'staging',
    embeddingModel: 'text-embedding-3-large',
    vectorStore: 'pinecone',
    chunkingStrategy: 'semantic-1024',
    totalDocuments: 1240,
    totalChunks: 5800,
    registeredAt: '2026-04-10T10:00:00Z',
    metrics: {
      chunkQualityScore: 79,
      averageChunkSize: 920,
      semanticBoundaryRespect: 82,
      metadataCoverage: 85,
      freshnessScore: 84,
      staleRatio: 0.16,
      orphanedChunks: 18,
      retrievalDriftScore: 80,
      queriesAnalyzed: 480,
      hallucinationScore: 73,
      citationCoverage: 68,
      contradictionRate: 0.06,
      piiIncidents: 8,
      sensitiveContentScore: 86,
    },
  },
];

export function findCollection(id: string): RagCollection | undefined {
  return collections.find((c) => c.collectionId === id);
}
