#!/bin/sh
set -eu

# Strip accidental wrapping quotes from Railway variable values
strip_quotes() {
  node -e "
    for (const [k,v] of Object.entries(process.env)) {
      if (typeof v === 'string' && ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith(\"'\") && v.endsWith(\"'\")))) {
        process.stdout.write('export ' + k + '=' + JSON.stringify(v.slice(1,-1)) + '\n');
      }
    }
  "
}
eval "$(strip_quotes)"

resolve_env() {
  node <<'NODE'
const { URL } = require('url');

function isLocal(host) {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
function unresolved(v) {
  return !v || v === 'auto' || String(v).includes('${{');
}
function shellExport(name, value) {
  const v = String(value).replace(/'/g, `'\"'\"'`);
  process.stdout.write(`export ${name}='${v}'\n`);
}

const prod = process.env.NODE_ENV === 'production';
const warnings = [];

// ── DATABASE_URL (required) ───────────────────────────────────────────────
let dbUrl = process.env.DATABASE_URL || '';
let dbHost = '';
try {
  if (dbUrl && !unresolved(dbUrl)) dbHost = new URL(dbUrl).hostname;
  else dbUrl = '';
} catch (_) {
  dbUrl = '';
}

const mysqlPluginUrl = process.env.MYSQL_URL || '';
const mysqlHost = process.env.MYSQLHOST || process.env.MYSQL_HOST || '';
const mysqlPort = process.env.MYSQLPORT || process.env.MYSQL_PORT || '3306';
const mysqlUser = process.env.MYSQLUSER || process.env.MYSQL_USER || 'revenue';
const mysqlPass = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const mysqlDb = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'revenue';

if (!dbUrl || (prod && isLocal(dbHost))) {
  if (mysqlPluginUrl && !unresolved(mysqlPluginUrl)) {
    dbUrl = mysqlPluginUrl;
    console.error('[entrypoint] Using MYSQL_URL');
  } else if (mysqlHost && mysqlPass && !isLocal(mysqlHost)) {
    dbUrl = `mysql://${encodeURIComponent(mysqlUser)}:${encodeURIComponent(mysqlPass)}@${mysqlHost}:${mysqlPort}/${mysqlDb}`;
    console.error(`[entrypoint] Built DATABASE_URL from MYSQLHOST=${mysqlHost}`);
  } else {
    console.error('FATAL: DATABASE_URL missing or still localhost.');
    console.error('Add MySQL service and set DATABASE_URL=${{MySQL.MYSQL_URL}} (no quotes, no 127.0.0.1).');
    process.exit(42);
  }
}
shellExport('DATABASE_URL', dbUrl);
try {
  const u = new URL(dbUrl);
  if (prod && isLocal(u.hostname)) {
    console.error('FATAL: DATABASE_URL host is still localhost after resolve');
    process.exit(42);
  }
  shellExport('MYSQL_WAIT_HOST', u.hostname);
  shellExport('MYSQL_WAIT_PORT', u.port || '3306');
} catch (e) {
  console.error('FATAL: invalid DATABASE_URL', e.message);
  process.exit(42);
}

// ── REDIS_URL (optional for boot; queues disabled if missing) ─────────────
let redisUrl = process.env.REDIS_URL || '';
if (unresolved(redisUrl)) {
  if (process.env.REDISHOST) {
    const pass = process.env.REDISPASSWORD || '';
    const auth = pass ? `:${encodeURIComponent(pass)}@` : '';
    redisUrl = `redis://${auth}${process.env.REDISHOST}:${process.env.REDISPORT || '6379'}`;
  } else {
    warnings.push('REDIS_URL missing — add Redis and set REDIS_URL=${{Redis.REDIS_URL}}. Queues disabled.');
    redisUrl = '';
    shellExport('QUEUES_DISABLED', '1');
  }
}
if (redisUrl) shellExport('REDIS_URL', redisUrl);
else shellExport('REDIS_URL', 'redis://127.0.0.1:6379');

// ── RABBITMQ_URL (optional for boot) ──────────────────────────────────────
let rabbitUrl = process.env.RABBITMQ_URL || '';
if (unresolved(rabbitUrl)) {
  const user = process.env.RABBITMQ_USER || process.env.RABBITMQ_DEFAULT_USER || 'revenue';
  const pass = process.env.RABBITMQ_PASS || process.env.RABBITMQ_DEFAULT_PASS || '';
  const host = process.env.RABBITMQ_HOST || process.env.RABBITMQHOST || '';
  const port = process.env.RABBITMQ_PORT || '5672';
  if (pass && host && !unresolved(host) && !unresolved(pass)) {
    rabbitUrl = `amqp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  } else {
    warnings.push('RABBITMQ_URL missing — add RabbitMQ service. Messaging disabled.');
    rabbitUrl = 'amqp://guest:guest@127.0.0.1:5672';
    shellExport('QUEUES_DISABLED', '1');
  }
}
shellExport('RABBITMQ_URL', rabbitUrl);

// ── API_URL ───────────────────────────────────────────────────────────────
let apiUrl = process.env.API_URL || '';
if (unresolved(apiUrl) || isLocal(apiUrl.replace(/^https?:\/\//, '').split(':')[0]) || apiUrl.includes('localhost')) {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) apiUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  else if (process.env.RENDER_EXTERNAL_URL) apiUrl = process.env.RENDER_EXTERNAL_URL;
  else apiUrl = `http://127.0.0.1:${process.env.PORT || 4000}`;
  console.error(`[entrypoint] API_URL normalized to ${apiUrl}`);
}
shellExport('API_URL', apiUrl);

for (const w of warnings) console.error('[entrypoint]', w);
NODE
}

if ! EVAL_OUT="$(resolve_env)"; then
  echo "Env resolution failed — starting diagnostic server"
  exec node /app/scripts/railway-start.cjs
fi
eval "$EVAL_OUT"

echo "Using MySQL at ${MYSQL_WAIT_HOST}:${MYSQL_WAIT_PORT}"
echo "Waiting for MySQL..."
i=0
until MYSQL_WAIT_HOST="$MYSQL_WAIT_HOST" MYSQL_WAIT_PORT="$MYSQL_WAIT_PORT" node -e "
  const net = require('net');
  const host = process.env.MYSQL_WAIT_HOST;
  const port = Number(process.env.MYSQL_WAIT_PORT || 3306);
  const socket = net.connect({ host, port }, () => { socket.end(); process.exit(0); });
  socket.on('error', () => process.exit(1));
  setTimeout(() => process.exit(1), 2000);
" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "MySQL did not become ready at ${MYSQL_WAIT_HOST}:${MYSQL_WAIT_PORT}"
    exec node /app/scripts/railway-start.cjs
  fi
  sleep 2
done

echo "Applying Prisma migrations..."
if ! pnpm --filter @revenue/database exec prisma migrate deploy; then
  echo "Migrations failed — starting diagnostic server"
  exec node /app/scripts/railway-start.cjs
fi

# Optional first-boot seed (set SEED_ON_BOOT=true once on Railway, then remove)
if [ "${SEED_ON_BOOT:-}" = "true" ] || [ "${SEED_ON_BOOT:-}" = "1" ]; then
  echo "SEED_ON_BOOT enabled — seeding database..."
  pnpm --filter @revenue/database seed || echo "Seed failed (non-fatal)"
fi

echo "Starting API on port ${PORT:-4000}... (QUEUES_DISABLED=${QUEUES_DISABLED:-0})"
exec node apps/api/dist/main.js
