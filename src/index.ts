import express from 'express';
import helmet from 'helmet';
import { assertRuntimeConfig, configuredPrincipals, env } from './config/env';
import { findPrincipal } from './auth/principals';
import { validateRouter } from './routes/validate';
import { collectionsRouter, incidentsRouter, dashboardRouter } from './routes/index';
import { vaultRouter } from './routes/vault';
import { realVaultFromEnv } from './vault/real-vault';

export const app = express();
app.disable('x-powered-by');
const startedAt = Date.now();

app.use(helmet());
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    process.stdout.write(`${JSON.stringify({ method: req.method, route, status: res.statusCode, durationMs: Date.now() - started })}\n`);
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'rag-sentinel',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    nodeEnv: env.nodeEnv,
  });
});

app.use('/api', (req, res, next) => {
  const principals = configuredPrincipals();
  if (principals.length === 0) {
    res.status(503).json({ error: 'API authentication is not configured.' });
    return;
  }
  const principal = findPrincipal(req.header('x-api-key') || '', principals);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.locals.principal = principal;
  next();
});

app.use('/api', express.json({ limit: '8mb' }));

app.use('/api/validate', validateRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/vault', vaultRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

if (require.main === module) {
  assertRuntimeConfig();
  realVaultFromEnv(); // Reject incomplete or malformed vault configuration before serving requests.
  app.listen(env.port, env.host, () => {
    // eslint-disable-next-line no-console
    console.log(`rag-sentinel listening on ${env.host}:${env.port}`);
  });
}
