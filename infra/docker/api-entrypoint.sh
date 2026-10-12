#!/bin/sh
set -eu

# ── DATABASE_URL (Railway MySQL plugin, Render private MySQL, or explicit) ──
if [ -z "${DATABASE_URL:-}" ] || [ "${DATABASE_URL}" = "auto" ]; then
  if [ -n "${MYSQL_URL:-}" ]; then
    export DATABASE_URL="$MYSQL_URL"
  else
    DATABASE_URL="$(
      node -e "
        const user = process.env.MYSQLUSER || process.env.MYSQL_USER || 'revenue';
        const pass = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
        const host = process.env.MYSQLHOST || process.env.MYSQL_HOST || 'revenue-mysql';
        const port = process.env.MYSQLPORT || process.env.MYSQL_PORT || '3306';
        const db = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'revenue';
        if (!pass) {
          console.error('Set DATABASE_URL, MYSQL_URL, or MYSQLPASSWORD/MYSQL_PASSWORD');
          process.exit(1);
        }
        const u = encodeURIComponent(user);
        const p = encodeURIComponent(pass);
        process.stdout.write(\`mysql://\${u}:\${p}@\${host}:\${port}/\${db}\`);
      "
    )"
    export DATABASE_URL
  fi
fi

# ── REDIS_URL (Railway Redis plugin usually injects this) ───────────────────
if [ -z "${REDIS_URL:-}" ] || [ "${REDIS_URL}" = "auto" ]; then
  if [ -n "${REDISHOST:-}" ]; then
    REDIS_URL="$(
      node -e "
        const h = process.env.REDISHOST;
        const port = process.env.REDISPORT || '6379';
        const pass = process.env.REDISPASSWORD || '';
        const auth = pass ? \`:\${encodeURIComponent(pass)}@\` : '';
        process.stdout.write(\`redis://\${auth}\${h}:\${port}\`);
      "
    )"
    export REDIS_URL
  else
    echo "REDIS_URL is required (link a Railway Redis service or set REDIS_URL)"
    exit 1
  fi
fi

# ── RABBITMQ_URL ────────────────────────────────────────────────────────────
if [ -z "${RABBITMQ_URL:-}" ] || [ "${RABBITMQ_URL}" = "auto" ]; then
  RABBITMQ_URL="$(
    node -e "
      const u = encodeURIComponent(process.env.RABBITMQ_USER || process.env.RABBITMQ_DEFAULT_USER || 'revenue');
      const p = encodeURIComponent(process.env.RABBITMQ_PASS || process.env.RABBITMQ_DEFAULT_PASS || '');
      const h = process.env.RABBITMQ_HOST || process.env.RABBITMQHOST || 'revenue-rabbitmq';
      const port = process.env.RABBITMQ_PORT || '5672';
      if (!p) {
        console.error('Set RABBITMQ_URL or RABBITMQ_PASS / RABBITMQ_DEFAULT_PASS');
        process.exit(1);
      }
      process.stdout.write(\`amqp://\${u}:\${p}@\${h}:\${port}\`);
    "
  )"
  export RABBITMQ_URL
fi

# ── Public API URL ──────────────────────────────────────────────────────────
if [ -z "${API_URL:-}" ] || [ "${API_URL}" = "auto" ]; then
  if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
    export API_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
  elif [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
    export API_URL="$RENDER_EXTERNAL_URL"
  else
    export API_URL="http://localhost:${PORT:-4000}"
  fi
fi

# Resolve MySQL host for readiness probe
MYSQL_WAIT_HOST="$(
  node -e "
    if (process.env.MYSQLHOST || process.env.MYSQL_HOST) {
      process.stdout.write(process.env.MYSQLHOST || process.env.MYSQL_HOST);
      process.exit(0);
    }
    try {
      const u = new URL(process.env.DATABASE_URL);
      process.stdout.write(u.hostname);
    } catch {
      process.stdout.write('127.0.0.1');
    }
  "
)"
MYSQL_WAIT_PORT="$(
  node -e "
    if (process.env.MYSQLPORT || process.env.MYSQL_PORT) {
      process.stdout.write(process.env.MYSQLPORT || process.env.MYSQL_PORT);
      process.exit(0);
    }
    try {
      const u = new URL(process.env.DATABASE_URL);
      process.stdout.write(u.port || '3306');
    } catch {
      process.stdout.write('3306');
    }
  "
)"

echo "Waiting for MySQL at ${MYSQL_WAIT_HOST}:${MYSQL_WAIT_PORT} ..."
i=0
until MYSQL_WAIT_HOST="$MYSQL_WAIT_HOST" MYSQL_WAIT_PORT="$MYSQL_WAIT_PORT" node -e "
  const net = require('net');
  const host = process.env.MYSQL_WAIT_HOST;
  const port = Number(process.env.MYSQL_WAIT_PORT || 3306);
  const socket = net.connect({ host, port }, () => {
    socket.end();
    process.exit(0);
  });
  socket.on('error', () => process.exit(1));
  setTimeout(() => process.exit(1), 2000);
" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "MySQL did not become ready — starting diagnostic server instead of crashing"
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
