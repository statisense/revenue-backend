#!/usr/bin/env node
/**
 * Production start for Railway.
 * - Missing required env → bind PORT and return diagnostic JSON (avoids 502).
 * - Env present → optional migrate, then NestJS.
 */
const http = require('http');
const { spawn, spawnSync } = require('child_process');
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

function normalizeEnv() {
  if (!process.env.API_URL || process.env.API_URL === 'auto') {
    process.env.API_URL = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://127.0.0.1:${port}`;
  }
  if (!process.env.API_PREFIX) process.env.API_PREFIX = 'api/v1';
  if (!process.env.CORS_ORIGINS && process.env.APP_URL) {
    process.env.CORS_ORIGINS = process.env.APP_URL;
  }
}

function missingEnv() {
  normalizeEnv();
  return required.filter((key) => {
    const val = process.env[key];
    return !val || val === 'auto' || /xxx|change-me/i.test(val);
  });
}

function serveDiagnostic(reason, missing) {
  console.error(`[railway-start] ${reason}`);
  http
    .createServer((req, res) => {
      const payload = {
        status: 'degraded',
        service: 'revenue-api',
        port,
        error: reason,
        missing,
        fix: [
          'Add Railway MySQL plugin and set DATABASE_URL=${{MySQL.MYSQL_URL}}',
          'Add Redis plugin and set REDIS_URL=${{Redis.REDIS_URL}}',
          'Add RabbitMQ and set RABBITMQ_URL=amqp://user:pass@host:5672',
          'Set JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, HMAC_PAYMENT_SECRET, FIELD_ENCRYPTION_KEY (64 hex)',
          'Set APP_URL and PAY_URL to your web URL (or this API URL temporarily)',
          'Prefer Build: Dockerfile path infra/docker/Dockerfile.api + start /app/infra/docker/api-entrypoint.sh',
        ],
      };
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload, null, 2));
    })
    .listen(port, '0.0.0.0', () => {
      console.log(`[railway-start] diagnostic server on 0.0.0.0:${port}`);
    });
}

const missing = missingEnv();
const entry = path.join(__dirname, '..', 'apps', 'api', 'dist', 'main.js');

if (missing.length) {
  serveDiagnostic(`Missing required environment variables: ${missing.join(', ')}`, missing);
} else if (!fs.existsSync(entry)) {
  serveDiagnostic(`Nest build missing at ${entry}`, missing);
} else {
  console.log('[railway-start] running prisma migrate deploy...');
  const migrate = spawnSync(
    'pnpm',
    ['--filter', '@revenue/database', 'exec', 'prisma', 'migrate', 'deploy'],
    { stdio: 'inherit', env: process.env, shell: true },
  );
  if (migrate.status !== 0) {
    serveDiagnostic(`prisma migrate deploy failed with code ${migrate.status}`, missing);
  } else {
    console.log(`[railway-start] starting Nest on port ${port}`);
    const child = spawn(process.execPath, [entry], { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => process.exit(code ?? 1));
  }
}
