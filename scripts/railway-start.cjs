#!/usr/bin/env node
/** Diagnostic HTTP server when API env/bootstrap fails. */
const http = require('http');

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const db = process.env.DATABASE_URL || '';
const mysqlUrl = process.env.MYSQL_URL || '';
const ports = [...new Set([Number(process.env.PORT) || 0, 4000, 8080].filter((p) => p > 0))];

const payload = {
  status: 'degraded',
  service: 'revenue-api',
  error:
    'API did not start. Check debug below — usually DATABASE_URL is empty, still a ${{...}} reference, or localhost.',
  debug: {
    PORT: process.env.PORT || null,
    DATABASE_URL_length: db.length,
    DATABASE_URL_host: hostOf(db),
    DATABASE_URL_isReference: db.includes('${{'),
    DATABASE_URL_isLocal: /127\.0\.0\.1|localhost/i.test(db),
    DATABASE_URL_prefix: db ? db.slice(0, 24) : null,
    MYSQL_URL_length: mysqlUrl.length,
    MYSQL_URL_host: hostOf(mysqlUrl),
    MYSQLHOST: process.env.MYSQLHOST || process.env.MYSQL_HOST || null,
    REDIS_URL_isReference: String(process.env.REDIS_URL || '').includes('${{'),
    RABBITMQ_URL_isReference: String(process.env.RABBITMQ_URL || '').includes('${{'),
    API_URL: process.env.API_URL || null,
  },
  fix: [
    'Confirm a MySQL service named exactly MySQL exists in this project',
    'On revenue-backend set DATABASE_URL=${{MySQL.MYSQL_URL}} with NO quotes around the value',
    'Or set DATABASE_URL by Variable Reference picker → MySQL → MYSQL_URL',
    'Add Redis + set REDIS_URL=${{Redis.REDIS_URL}}',
    'Add RabbitMQ + set RABBITMQ_URL',
    'Redeploy after saving variables',
  ],
};

console.error('[railway-start]', JSON.stringify(payload.debug));

for (const p of ports) {
  http
    .createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload, null, 2));
    })
    .listen(p, '0.0.0.0', () => console.log(`[railway-start] diagnostic on :${p}`))
    .on('error', (e) => console.error(`[railway-start] :${p}`, e.message));
}
