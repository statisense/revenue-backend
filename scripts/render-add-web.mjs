#!/usr/bin/env node
/**
 * Create revenue-web on Render pointing at Railway API.
 *   $env:RENDER_API_KEY="rnd_..."
 *   node scripts/render-add-web.mjs
 */
const KEY = process.env.RENDER_API_KEY;
const API = 'https://api.render.com/v1';
const REPO = process.env.RENDER_REPO || 'https://github.com/statisense/revenue-backend';
const BRANCH = process.env.RENDER_BRANCH || 'master';
const RAILWAY_API =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://revenue-backend-production-9be7.up.railway.app/api/v1';
const NAME = process.env.RENDER_WEB_NAME || 'revenue-web';

if (!KEY) {
  console.error('Missing RENDER_API_KEY');
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
    throw new Error(`${method} ${path} → ${res.status}\n${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

const list = await req('GET', '/services?limit=50');
const services = (Array.isArray(list) ? list : []).map((r) => r.service || r);
const existing = services.find((s) => s.name === NAME);
const apiLike = services.find((s) => s.name === 'revenue-backend') || services[0];
const ownerId = apiLike?.ownerId;
const region = apiLike?.serviceDetails?.region || 'oregon';

if (!ownerId) {
  console.error('No ownerId found from existing services');
  process.exit(1);
}

let web = existing;
if (web) {
  console.log(`Service already exists: ${web.name} (${web.id})`);
  console.log(`  URL: ${web.serviceDetails?.url || '(pending)'}`);
} else {
  console.log(`Creating ${NAME} (free web service)…`);
  const created = await req('POST', '/services', {
    type: 'web_service',
    name: NAME,
    ownerId,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: 'yes',
    envVars: [
      { key: 'NODE_ENV', value: 'production' },
      { key: 'PORT', value: '3000' },
      { key: 'HOSTNAME', value: '0.0.0.0' },
      { key: 'NEXT_PUBLIC_API_URL', value: RAILWAY_API },
      { key: 'NEXT_PUBLIC_AUTO_LOGIN', value: 'false' },
    ],
    serviceDetails: {
      runtime: 'docker',
      plan: 'free',
      region,
      healthCheckPath: '/',
      envSpecificDetails: {
        dockerContext: '.',
        dockerfilePath: './infra/docker/Dockerfile.web',
      },
    },
  });
  web = created.service || created;
  console.log(`Created: ${web.id}`);
}

// Ensure env vars even if service existed
for (const [key, value] of [
  ['NODE_ENV', 'production'],
  ['PORT', '3000'],
  ['HOSTNAME', '0.0.0.0'],
  ['NEXT_PUBLIC_API_URL', RAILWAY_API],
  ['NEXT_PUBLIC_AUTO_LOGIN', 'false'],
]) {
  await req('PUT', `/services/${web.id}/env-vars/${encodeURIComponent(key)}`, { value });
  console.log(`  set ${key}`);
}

console.log('Triggering deploy…');
const deploy = await req('POST', `/services/${web.id}/deploys`, { clearCache: 'clear' });
console.log(`Deploy: ${deploy.id || deploy.deploy?.id || JSON.stringify(deploy)}`);

const fresh = (await req('GET', `/services/${web.id}`)).service || (await req('GET', `/services/${web.id}`));
const url = fresh.serviceDetails?.url || web.serviceDetails?.url;
console.log('\nDone.');
console.log(`Web URL: ${url}`);
console.log(`API:     ${RAILWAY_API}`);
console.log('Build can take 5–15 min on free tier. Then set Railway CORS to this Web URL.');
