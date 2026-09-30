import dotenv from 'dotenv';
import { demoPrincipal, isApiKeyFormat, parsePrincipals, type ApiPrincipal } from '../auth/principals';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  apiKey: process.env.RAG_SENTINEL_API_KEY || '',
  localDemo: process.env.RAG_SENTINEL_LOCAL_DEMO === 'true',
  principals: parsePrincipals(process.env.RAG_SENTINEL_PRINCIPALS_JSON),
};

export function assertRuntimeConfig(): void {
  if (env.principals.length > 0) {
    if (env.localDemo || env.apiKey) throw new Error('Principal mode cannot be combined with the local demo key or flag.');
    return;
  }
  if (!env.localDemo || !isApiKeyFormat(env.apiKey) || env.nodeEnv === 'production' || !['127.0.0.1', '::1'].includes(env.host)) {
    throw new Error('Configure RAG_SENTINEL_PRINCIPALS_JSON, or explicitly enable a loopback-only non-production local demo with RAG_SENTINEL_LOCAL_DEMO=true and a 64-character hex RAG_SENTINEL_API_KEY generated from 32 random bytes.');
  }
  if (process.env.SKYYFLOW_VAULT_URL || process.env.SKYYFLOW_ACCESS_TOKEN || process.env.SKYYFLOW_VAULT_ID) {
    throw new Error('The local mock demo cannot connect to a real vault.');
  }
}

export function configuredPrincipals(): ApiPrincipal[] {
  if (env.principals.length > 0) return env.principals;
  if (env.localDemo && isApiKeyFormat(env.apiKey) && env.nodeEnv !== 'production' && ['127.0.0.1', '::1'].includes(env.host)) {
    return [demoPrincipal(env.apiKey)];
  }
  return [];
}
