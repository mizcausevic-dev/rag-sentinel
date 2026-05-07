import { z } from 'zod';

export const ChunkSchema = z.object({
  chunkId: z.string().min(1),
  collectionId: z.string().min(1),
  text: z.string(),
  tokenCount: z.number().min(0),
  metadata: z.record(z.unknown()).default({}),
  sourceUri: z.string(),
  sourceLastUpdated: z.string(),
});

export const ChunkBatchSchema = z.object({
  chunks: z.array(ChunkSchema).min(1),
});

export const FreshnessAuditSchema = z.object({
  collectionId: z.string().optional(),
  sources: z
    .array(
      z.object({
        sourceId: z.string().min(1),
        collectionId: z.string().optional().default(''),
        lastUpdated: z.string(),
      })
    )
    .min(1),
});

export const RetrievalSnapshotSchema = z.object({
  query: z.string().min(1),
  timestamp: z.string(),
  collectionId: z.string().min(1),
  embeddingModel: z.string().min(1),
  results: z.array(
    z.object({
      chunkId: z.string().min(1),
      score: z.number(),
      rank: z.number().min(0),
    })
  ),
});

export const DriftCheckSchema = z.object({
  baseline: RetrievalSnapshotSchema,
  current: RetrievalSnapshotSchema,
});

export const AnswerEvaluationSchema = z.object({
  answerText: z.string(),
  citationsClaimed: z
    .array(
      z.object({
        sourceId: z.string().min(1),
        quote: z.string(),
      })
    )
    .default([]),
  retrievedSources: z.array(
    z.object({
      sourceId: z.string().min(1),
      text: z.string(),
    })
  ),
  refusalReasons: z.array(z.string()).optional(),
});

export const PiiScanSchema = z.object({
  chunks: z
    .array(
      z.object({
        chunkId: z.string().min(1),
        text: z.string(),
      })
    )
    .min(1),
});
