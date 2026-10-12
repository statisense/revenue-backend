#!/usr/bin/env node
/**
 * Production start for Railway Railpack (when Dockerfile builder is not used).
 * - If required env is missing: bind PORT and serve a diagnostic /api/v1/health
 *   so networking works and the dashboard shows a clear 503 payload.
 * - If env is present: exec NestJS on PORT.
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const port = Number(process.env.PORT || 4000);
const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'RABBITMQ_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'HMAC_PAYMENT_SECRET',
  'FIELD_ENCRYPTION_KEY',
  'APP_URL',
  'PAY_URL',
];

function missingEnv() {
  if (!process.env.API_URL || process.env.API_URL === 'auto') {
    process.env.API_URL = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://127.0.0.1:${port}`;
  }
  if (!process.env.API_PREFIX) process.env.API_PREFIX = 'api/v1';
  if (!process.env.CORS_ORIGINS && process.env.APP_URL) {
    process.env.CORS_ORIGINS = process.env.APP_URL;
  }
  return required.filter((key) => {
    const val = process.env[key];
    return !val || val === 'auto' || /xxx|change-me/i.test(val);
  });
}

const missing = missingEnv();
const entry = path.join(__dirname, '..', 'apps', 'api', 'dist', 'main.js');

if (!missing.length && fs.existsSync(entry)) {
  console.log(`[railway-start] env ok — exec Nest on port ${port}`);
  const child = spawn(process.execPath, [entry], { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  const reason = missing.length
    ? `Missing required environment variables: ${missing.join(', ')}`
    : `Nest build missing at ${entry} (Railpack must run pnpm build first)`;
  console.error(`[railway-start] ${reason}`);
  console.error('[railway-start] Serving diagnostic health on PORT until config is fixed.');

  http
    .createServer((req, res) => {
      const url = req.url || '/';
      const payload = {
        status: 'degraded',
        service: 'revenue-api',
        port,
        error: reason,
        missing,
        builderHint:
          'In Railway → Settings → Build set Builder=Dockerfile, Dockerfile path=infra/docker/Dockerfile.api, Start=/app/infra/docker/api-entrypoint.sh. Add MySQL + Redis + RabbitMQ and wire DATABASE_URL / REDIS_URL / RABBITMQ_URL.',
      };
      const code = url.includes('health') || url === '/' ? 503 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    })
    .listen(port, '0.0.0.0', () => {
      console.log(`[railway-start] diagnostic server on 0.0.0.0:${port}`);
    });
}
