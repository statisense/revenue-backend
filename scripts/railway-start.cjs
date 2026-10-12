#!/usr/bin/env node
/** Diagnostic HTTP server when DB/Redis/RabbitMQ env is wrong or unreachable. */
const http = require('http');

const ports = [...new Set([Number(process.env.PORT) || 0, 4000, 8080].filter((p) => p > 0))];

const payload = {
  status: 'degraded',
  service: 'revenue-api',
  error:
    'API did not start. Usually DATABASE_URL still points at local MySQL (127.0.0.1:3316) or MySQL/Redis/RabbitMQ are missing on Railway.',
  fix: [
    'In Railway project, add MySQL + Redis (+ RabbitMQ) services',
    'On revenue-backend Variables set:',
    '  DATABASE_URL=${{MySQL.MYSQL_URL}}',
    '  REDIS_URL=${{Redis.REDIS_URL}}',
    '  RABBITMQ_URL=amqp://user:pass@${{RabbitMQ.RAILWAY_PRIVATE_DOMAIN}}:5672',
    'Delete any DATABASE_URL that contains 127.0.0.1 or localhost or port 3316',
    'Redeploy revenue-backend',
  ],
  portEnv: process.env.PORT || null,
};

const server = http.createServer((_req, res) => {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload, null, 2));
});

for (const p of ports) {
  http
    .createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload, null, 2));
    })
    .listen(p, '0.0.0.0', () => console.log(`[railway-start] diagnostic on :${p}`))
    .on('error', (e) => console.error(`[railway-start] :${p}`, e.message));
}

console.error('[railway-start]', payload.error);
