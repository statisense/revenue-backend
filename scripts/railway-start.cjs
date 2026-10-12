#!/usr/bin/env node
/**
 * Railway start: ALWAYS bind PORT first (prevents 502), then boot Nest if env allows.
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

const missing = missingEnv();
const entry = path.join(__dirname, '..', 'apps', 'api', 'dist', 'main.js');
let phase = 'starting';
let detail =
  missing.length > 0
    ? `Missing required environment variables: ${missing.join(', ')}`
    : !fs.existsSync(entry)
      ? `Nest build missing at ${entry}`
      : 'Booting API…';

const server = http.createServer((_req, res) => {
  const ok = phase === 'ready';
  res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify(
      {
        status: ok ? 'ok' : 'degraded',
        service: 'revenue-api',
        phase,
        port,
        error: ok ? undefined : detail,
        missing,
        fix: [
          'Add MySQL → DATABASE_URL=${{MySQL.MYSQL_URL}}',
          'Add Redis → REDIS_URL=${{Redis.REDIS_URL}}',
          'Add RabbitMQ → RABBITMQ_URL',
          'Set JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, HMAC_PAYMENT_SECRET, FIELD_ENCRYPTION_KEY',
          'Set APP_URL + PAY_URL',
          'Redeploy after variables are set',
        ],
      },
      null,
      2,
    ),
  );
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[railway-start] bound 0.0.0.0:${port} (${detail})`);
  if (missing.length || !fs.existsSync(entry)) {
    phase = 'degraded';
    return;
  }
  setImmediate(() => tryBoot());
});

function tryBoot() {
  phase = 'migrating';
  detail = 'Running prisma migrate deploy…';
  console.log('[railway-start]', detail);

  const migrate = spawnSync(
    'pnpm',
    ['--filter', '@revenue/database', 'exec', 'prisma', 'migrate', 'deploy'],
    { env: process.env, shell: true, timeout: 20000, encoding: 'utf8' },
  );

  if (migrate.error || migrate.status !== 0) {
    phase = 'degraded';
    detail = `prisma migrate failed: ${migrate.error?.message || migrate.stderr || migrate.status}`;
    console.error('[railway-start]', detail);
    return;
  }

  phase = 'launching';
  detail = 'Starting NestJS…';
  console.log('[railway-start] closing diagnostic server, starting Nest');

  server.close(() => {
    const child = spawn(process.execPath, [entry], { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => {
      console.error('[railway-start] Nest exited', code);
      process.exit(code ?? 1);
    });
  });
}
