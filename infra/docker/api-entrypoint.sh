#!/bin/sh
set -eu

# Resolve DATABASE_URL / REDIS_URL / RABBITMQ_URL for Railway, then migrate + start.
# Rejects local .env hosts (127.0.0.1:3316) in production.

resolve_env() {
  node <<'NODE'
const { URL } = require('url');

function isLocal(host) {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function shellExport(name, value) {
  // Safe single-quote escaping for eval
  const v = String(value).replace(/'/g, `'\"'\"'`);
  process.stdout.write(`export ${name}='${v}'\n`);
}

const prod = process.env.NODE_ENV === 'production';

// ── DATABASE_URL ──────────────────────────────────────────────────────────
let dbUrl = process.env.DATABASE_URL || '';
let dbHost = '';
try {
  if (dbUrl && dbUrl !== 'auto') dbHost = new URL(dbUrl).hostname;
} catch (_) {
  dbUrl = '';
}

const mysqlPluginUrl = process.env.MYSQL_URL || '';
const mysqlHost = process.env.MYSQLHOST || process.env.MYSQL_HOST || '';
const mysqlPort = process.env.MYSQLPORT || process.env.MYSQL_PORT || '3306';
const mysqlUser = process.env.MYSQLUSER || process.env.MYSQL_USER || 'revenue';
const mysqlPass = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const mysqlDb = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'revenue';

if (!dbUrl || dbUrl === 'auto' || (prod && isLocal(dbHost))) {
  if (mysqlPluginUrl) {
    dbUrl = mysqlPluginUrl;
    console.error(`[entrypoint] Using MYSQL_URL (replaced local/missing DATABASE_URL host=${dbHost || 'none'})`);
  } else if (mysqlHost && mysqlPass) {
    dbUrl = `mysql://${encodeURIComponent(mysqlUser)}:${encodeURIComponent(mysqlPass)}@${mysqlHost}:${mysqlPort}/${mysqlDb}`;
    console.error(`[entrypoint] Built DATABASE_URL from MYSQLHOST=${mysqlHost}`);
  } else if (prod && isLocal(dbHost)) {
    console.error('');
    console.error('FATAL: DATABASE_URL points at localhost (e.g. 127.0.0.1:3316).');
    console.error('That only works on your laptop — not on Railway.');
    console.error('');
    console.error('Fix in Railway → revenue-backend → Variables:');
    console.error('  1. Add a MySQL database service to this project');
    console.error('  2. Set DATABASE_URL=${{MySQL.MYSQL_URL}}');
    console.error('     (use your exact MySQL service name if different)');
    console.error('  3. Remove any DATABASE_URL with 127.0.0.1 or localhost');
    console.error('');
    process.exit(42);
  } else if (!dbUrl || dbUrl === 'auto') {
    console.error('FATAL: DATABASE_URL is required');
    process.exit(42);
  }
}
shellExport('DATABASE_URL', dbUrl);

try {
  const u = new URL(dbUrl);
  shellExport('MYSQL_WAIT_HOST', u.hostname);
  shellExport('MYSQL_WAIT_PORT', u.port || '3306');
} catch (e) {
  console.error('FATAL: invalid DATABASE_URL', e.message);
  process.exit(42);
}

// ── REDIS_URL ─────────────────────────────────────────────────────────────
let redisUrl = process.env.REDIS_URL || '';
if (!redisUrl || redisUrl === 'auto') {
  if (process.env.REDISHOST) {
    const pass = process.env.REDISPASSWORD || '';
    const auth = pass ? `:${encodeURIComponent(pass)}@` : '';
    redisUrl = `redis://${auth}${process.env.REDISHOST}:${process.env.REDISPORT || '6379'}`;
  } else {
    console.error('FATAL: REDIS_URL is required. Add Redis and set REDIS_URL=${{Redis.REDIS_URL}}');
    process.exit(42);
  }
}
shellExport('REDIS_URL', redisUrl);

// ── RABBITMQ_URL ──────────────────────────────────────────────────────────
let rabbitUrl = process.env.RABBITMQ_URL || '';
if (!rabbitUrl || rabbitUrl === 'auto') {
  const user = process.env.RABBITMQ_USER || process.env.RABBITMQ_DEFAULT_USER || 'revenue';
  const pass = process.env.RABBITMQ_PASS || process.env.RABBITMQ_DEFAULT_PASS || '';
  const host = process.env.RABBITMQ_HOST || process.env.RABBITMQHOST || '';
  const port = process.env.RABBITMQ_PORT || '5672';
  if (!pass || !host) {
    console.error('FATAL: RABBITMQ_URL is required (or RABBITMQ_HOST + password)');
    process.exit(42);
  }
  rabbitUrl = `amqp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
}
shellExport('RABBITMQ_URL', rabbitUrl);

// ── API_URL ───────────────────────────────────────────────────────────────
let apiUrl = process.env.API_URL || '';
if (!apiUrl || apiUrl === 'auto') {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) apiUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  else if (process.env.RENDER_EXTERNAL_URL) apiUrl = process.env.RENDER_EXTERNAL_URL;
  else apiUrl = `http://localhost:${process.env.PORT || 4000}`;
}
shellExport('API_URL', apiUrl);
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
  if [ "$i" -gt 45 ]; then
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

echo "Starting API on port ${PORT:-4000}..."
exec node apps/api/dist/main.js
