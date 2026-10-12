# Deploy fullstack on Railway (API + Web)

This monorepo needs **two app services** from the same GitHub repo, plus data services.

| Railway service | Config-as-code path | Dockerfile | Public URL |
|-----------------|---------------------|------------|------------|
| **revenue-backend** | `/apps/api/railway.toml` | `infra/docker/Dockerfile.api` | API + Swagger `/docs` |
| **revenue-web** | `/apps/web/railway.toml` | `infra/docker/Dockerfile.web` | Admin `/login` + pay `/pay` |
| **MySQL** | plugin | — | private |
| **Redis** | plugin | — | private |
| **RabbitMQ** | `/infra/railway/rabbitmq/railway.toml` | `infra/docker/Dockerfile.rabbitmq` | private |

Repo: `statisense/revenue-backend`

## Why you only saw the API

Deploying one GitHub service from the repo root builds the **API** only.  
The **frontend** is a separate Railway service (`revenue-web`) with its own Dockerfile.

## Setup (dashboard)

### 1. Data services
1. **New → Database → MySQL** (name it `MySQL`)
2. **New → Database → Redis** (name it `Redis`)
3. **New → Empty service / Docker** for RabbitMQ (name it `RabbitMQ`)  
   - Image: `rabbitmq:3-management-alpine`  
   - Vars: `RABBITMQ_DEFAULT_USER=revenue`, `RABBITMQ_DEFAULT_PASS=<strong>`

### 2. API — `revenue-backend` (may already exist)
1. Settings → **Root Directory** = `/`
2. **Config as code** = `/apps/api/railway.toml`  
   (or Builder=Dockerfile, path `infra/docker/Dockerfile.api`)
3. Public domain + **port `4000`**
4. Variables from [`.env.railway.example`](../.env.railway.example) **API section**
5. Critical:
   - `DATABASE_URL=${{MySQL.MYSQL_URL}}` (not localhost)
   - `REDIS_URL=${{Redis.REDIS_URL}}`
   - `APP_URL` / `PAY_URL` / `CORS_ORIGINS` → `${{revenue-web.RAILWAY_PUBLIC_DOMAIN}}`  
     (after Web exists; temporary: use API domain)

### 3. Web — `revenue-web` (create this)
1. **New → GitHub Repo** → `statisense/revenue-backend`
2. Name: **`revenue-web`**
3. Settings → **Root Directory** = `/`
4. **Config as code** = `/apps/web/railway.toml`
5. Public domain + **port `3000`**
6. Variables:
   ```text
   NEXT_PUBLIC_API_URL=https://${{revenue-backend.RAILWAY_PUBLIC_DOMAIN}}/api/v1
   NEXT_PUBLIC_AUTO_LOGIN=false
   PORT=3000
   ```
7. Deploy Web **after** API has a public domain (URL is baked into the JS bundle).

### 4. Wire API ↔ Web
On **revenue-backend** set:
```text
APP_URL=https://${{revenue-web.RAILWAY_PUBLIC_DOMAIN}}
PAY_URL=https://${{revenue-web.RAILWAY_PUBLIC_DOMAIN}}
CORS_ORIGINS=https://${{revenue-web.RAILWAY_PUBLIC_DOMAIN}}
```
Redeploy API.

### 5. Seed (once)
On API: `SEED_ON_BOOT=true` → redeploy → set `false` → redeploy.

Login: `admin@ncs.gov.ng` / `ChangeMe@12345`

## Smoke test

- API health: `https://<api>/api/v1/health`
- Swagger: `https://<api>/docs`
- Admin: `https://<web>/login`
- Pay: `https://<web>/pay`

## Deploy order

MySQL → Redis → RabbitMQ → **revenue-backend** → **revenue-web** → update API CORS/APP_URL → redeploy API
