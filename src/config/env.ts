import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: process.env.RAG_SENTINEL_API_KEY || '',
};

export function assertRuntimeConfig(): void {
  if (env.apiKey.trim().length < 32) {
    throw new Error('RAG_SENTINEL_API_KEY must be configured with at least 32 characters before serving HTTP.');
  }
}
