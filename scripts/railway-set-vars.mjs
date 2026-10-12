#!/usr/bin/env node
/**
 * Upsert revenue-backend env vars on Statisense aware-reflection via GraphQL.
 * Uses ~/.railway/config.json token.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf8'));
const token = cfg.user.token || cfg.user.accessToken;
const PROJECT = '411d023d-a6d8-4bf4-8d89-d023e022539f';
const ENV = 'c78d17e0-b4e6-4978-8cdb-816ffdd901bf';
const SERVICE = '98b289ff-4337-42a6-953f-0157ae500090';

const WEB = process.env.RENDER_WEB_URL || 'https://revenue-web-uwcy.onrender.com';

const VARS = {
  APP_URL: WEB,
  PAY_URL: WEB,
  CORS_ORIGINS: WEB,
  HR_STAFF_API_URL: 'https://hr.ncaa.gov.ng/old_hr/apis/apps/get_staff_data',
  HR_SSO_ENABLED: 'true',
  HR_SSO_GRANT_SUPER_ADMIN: 'true',
  SEED_ON_BOOT: process.env.SEED_ON_BOOT || 'false',
};

async function gql(query, variables) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

let failed = 0;
for (const [name, value] of Object.entries(VARS)) {
  const r = await gql(
    `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    {
      input: {
        projectId: PROJECT,
        environmentId: ENV,
        serviceId: SERVICE,
        name,
        value,
      },
    },
  );
  if (r.errors) {
    failed += 1;
    console.error(`FAIL ${name}:`, JSON.stringify(r.errors));
  } else {
    console.log(`OK  ${name}=${value}`);
  }
}

if (failed) {
  console.error(`\n${failed} variable(s) failed — account may lack write permission on Statisense.`);
  process.exit(1);
}

const deploy = await gql(
  `mutation($input: DeploymentTriggerInput!) {
    deploymentTrigger(input: $input) { id }
  }`,
  {
    input: {
      // fallbacks tried below if this shape fails
    },
  },
);
console.log('deployTrigger probe', JSON.stringify(deploy));

process.exit(0);
