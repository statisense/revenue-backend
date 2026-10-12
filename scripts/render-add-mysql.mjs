#!/usr/bin/env node
/**
 * Provision revenue-mysql on Render (Docker MySQL 8) and wire the existing API.
 *
 * Usage:
 *   $env:RENDER_API_KEY = "rnd_..."   # Account Settings → API Keys
 *   node scripts/render-add-mysql.mjs
 *
 * Optional:
 *   RENDER_API_SERVICE=revenue-backend-q2kk   # substring match on name or URL
 *   RENDER_MYSQL_NAME=revenue-mysql
 *   RENDER_OWNER_ID=...                      # workspace id if you have several
 */

import { randomBytes } from 'node:crypto';

const API = 'https://api.render.com/v1';
const KEY = process.env.RENDER_API_KEY;
const API_MATCH = process.env.RENDER_API_SERVICE || 'revenue-backend-q2kk';
const MYSQL_NAME = process.env.RENDER_MYSQL_NAME || 'revenue-mysql';
const REPO = process.env.RENDER_REPO || 'https://github.com/statisense/revenue-backend';
const BRANCH = process.env.RENDER_BRANCH || 'master';

if (!KEY) {
  console.error('Missing RENDER_API_KEY.');
  console.error('Create one: https://dashboard.render.com/u/settings#api-keys');
  console.error('Then:  $env:RENDER_API_KEY="rnd_..." ; node scripts/render-add-mysql.mjs');
  process.exit(1);
}

async function req(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    throw new Error(`${method} ${path} → ${res.status}\n${msg}`);
  }
  return data;
}

function unwrapList(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => row.service || row.owner || row.envVar || row);
}

function cryptoPass() {
  return randomBytes(24).toString('base64url');
}

async function listAllServices() {
  const out = [];
  let cursor = '';
  for (let i = 0; i < 20; i++) {
    const q = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50';
    const page = await req('GET', `/services${q}`);
    if (!Array.isArray(page) || page.length === 0) break;
    for (const row of page) {
      out.push(row.service || row);
      if (row.cursor) cursor = row.cursor;
    }
    if (page.length < 50) break;
  }
  return out;
}

async function main() {
  console.log('Listing Render services…');
  const services = await listAllServices();

  const apiSvc = services.find((s) => {
    const name = (s.name || '').toLowerCase();
    const url = (s.serviceDetails?.url || s.url || '').toLowerCase();
    const m = API_MATCH.toLowerCase();
    return name.includes(m) || url.includes(m);
  });

  if (!apiSvc?.id) {
    console.error(`Could not find API service matching "${API_MATCH}".`);
    console.error(
      'Services:',
      services.map((s) => `${s.name} (${s.serviceDetails?.url || s.id})`).join('\n  '),
    );
    process.exit(1);
  }

  console.log(`API service: ${apiSvc.name} (${apiSvc.id})`);
  console.log(`  URL: ${apiSvc.serviceDetails?.url || '(none)'}`);

  const ownerId = process.env.RENDER_OWNER_ID || apiSvc.ownerId;
  if (!ownerId) {
    console.error('No ownerId / workspace id. Set RENDER_OWNER_ID.');
    process.exit(1);
  }

  let mysql = services.find((s) => s.name === MYSQL_NAME);
  const createdNew = !mysql?.id;
  let password = '';

  if (mysql?.id) {
    console.log(`MySQL already exists: ${mysql.name} (${mysql.id})`);
    const envRows = await req('GET', `/services/${mysql.id}/env-vars`);
    const list = unwrapList(envRows);
    password = list.find((e) => e.key === 'MYSQL_PASSWORD')?.value || '';
    if (!password) {
      password = cryptoPass();
      console.warn('MYSQL_PASSWORD missing on MySQL service — generating and setting one.');
      await req('PUT', `/services/${mysql.id}/env-vars/MYSQL_PASSWORD`, { value: password });
      await req('PUT', `/services/${mysql.id}/env-vars/MYSQL_ROOT_PASSWORD`, {
        value: cryptoPass(),
      });
      await req('PUT', `/services/${mysql.id}/env-vars/MYSQL_USER`, { value: 'revenue' });
      await req('PUT', `/services/${mysql.id}/env-vars/MYSQL_DATABASE`, { value: 'revenue' });
    }
  } else {
    password = cryptoPass();
    const rootPassword = cryptoPass();
    console.log(`Creating private service ${MYSQL_NAME} (Starter + 10GB disk)…`);
    console.log('Note: private MySQL + disk requires a paid Render Starter plan.');

    const created = await req('POST', '/services', {
      type: 'private_service',
      name: MYSQL_NAME,
      ownerId,
      repo: REPO,
      branch: BRANCH,
      autoDeploy: 'no',
      envVars: [
        { key: 'MYSQL_DATABASE', value: 'revenue' },
        { key: 'MYSQL_USER', value: 'revenue' },
        { key: 'MYSQL_PASSWORD', value: password },
        { key: 'MYSQL_ROOT_PASSWORD', value: rootPassword },
      ],
      serviceDetails: {
        runtime: 'docker',
        plan: 'starter',
        region: apiSvc.serviceDetails?.region || 'oregon',
        envSpecificDetails: {
          dockerContext: '.',
          dockerfilePath: './infra/docker/Dockerfile.mysql',
        },
        disk: {
          name: 'revenue-mysql-data',
          mountPath: '/var/lib/mysql',
          sizeGB: 10,
        },
      },
    });

    mysql = created.service || created;
    console.log(`Created MySQL: ${mysql.id}`);
  }

  const mysqlGet = await req('GET', `/services/${mysql.id}`);
  const mysqlFresh = mysqlGet.service || mysqlGet;
  const hostRaw =
    mysqlFresh.serviceDetails?.url ||
    mysqlFresh.serviceDetails?.host ||
    MYSQL_NAME;
  // url is often "host:3306"
  const host = String(hostRaw).split(':')[0];

  console.log(`MySQL host: ${host}`);
  console.log('Updating API environment variables…');

  const upsert = async (key, value) => {
    await req('PUT', `/services/${apiSvc.id}/env-vars/${encodeURIComponent(key)}`, { value });
    console.log(`  set ${key}`);
  };

  // Clear Railway-style literal if present by overwriting
  await upsert('DATABASE_URL', 'auto');
  await upsert('MYSQL_HOST', host);
  await upsert('MYSQL_PORT', '3306');
  await upsert('MYSQL_USER', 'revenue');
  await upsert('MYSQL_DATABASE', 'revenue');
  await upsert('MYSQL_PASSWORD', password);

  // Drop broken Railway refs if they exist as separate keys
  for (const bad of ['REDIS_URL', 'RABBITMQ_URL']) {
    try {
      const rows = await req('GET', `/services/${apiSvc.id}/env-vars`);
      const list = unwrapList(rows);
      const hit = list.find((e) => e.key === bad && String(e.value || '').includes('${{'));
      if (hit) {
        // Replace with empty so entrypoint treats as optional missing
        await upsert(bad, '');
        console.log(`  cleared broken ${bad}`);
      }
    } catch {
      /* ignore */
    }
  }

  console.log('Triggering API deploy…');
  await req('POST', `/services/${apiSvc.id}/deploys`, { clearCache: 'do_not_clear' });

  if (createdNew) {
    console.log('Triggering MySQL deploy…');
    await req('POST', `/services/${mysql.id}/deploys`, { clearCache: 'do_not_clear' });
  }

  console.log('\nDone.');
  console.log(`MySQL service: ${MYSQL_NAME} (${mysql.id})`);
  console.log(`MYSQL_HOST=${host}`);
  console.log(`MYSQL_PASSWORD=(set on API + MySQL — check Environment tabs)`);
  console.log(`Health: https://${API_MATCH}.onrender.com/api/v1/health`);
  console.log('Wait 2–5 minutes for MySQL disk + API migrate, then recheck health.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
