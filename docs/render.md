# Deploy on Render

## Live frontend (admin + /pay) → Railway API

| Piece | URL |
|-------|-----|
| **Web** | https://revenue-web-uwcy.onrender.com |
| **API** | https://revenue-backend-production-9be7.up.railway.app |

### HR SSO deep-link

`https://revenue-web-uwcy.onrender.com/?ctx=<jwt>&cid=1&stid=1&from=basement`  
→ web calls Railway `POST /api/v1/auth/hr-sso` → HR staff API → admin session.

Web was created with `scripts/render-add-web.mjs` (`Dockerfile.web`, free plan).

On **Railway** `revenue-backend` set (then redeploy):

```text
APP_URL=https://revenue-web-uwcy.onrender.com
PAY_URL=https://revenue-web-uwcy.onrender.com
CORS_ORIGINS=https://revenue-web-uwcy.onrender.com
```

Live API example (Render, optional): `https://revenue-backend-q2kk.onrender.com`

## Critical: Render ≠ Railway env syntax

| Platform | How to set MySQL URL |
|----------|----------------------|
| **Railway** | `DATABASE_URL=${{MySQL.MYSQL_URL}}` |
| **Render** | `DATABASE_URL=auto` + `MYSQL_HOST` / `MYSQL_PASSWORD` / … |

If health JSON shows `"DATABASE_URL_prefix": "${{MySQL.MYSQL_URL}}"`, Render did **not** expand it — fix the variables below.

## Add MySQL (Docker private service) via API

Creates `revenue-mysql` from `infra/docker/Dockerfile.mysql`, sets `MYSQL_*` on the API, and redeploys.

1. Create an API key: [Account Settings → API Keys](https://dashboard.render.com/u/settings#api-keys)
2. Ensure billing can cover a **Starter** private service + 10 GB disk (required for MySQL).
3. Run:

```powershell
$env:RENDER_API_KEY = "rnd_..."
node scripts/render-add-mysql.mjs
```

Or apply the Blueprint (`render.yaml`) from **New → Blueprint** — that also creates `revenue-mysql` and links host/password.

## Fix current API (`revenue-backend-q2kk`)

On the **API service** → **Environment**:

1. **Delete** any `DATABASE_URL` that contains `${{`
2. **Set:**

```text
DATABASE_URL=auto
MYSQL_HOST=<Internal hostname of your MySQL private service>
MYSQL_PORT=3306
MYSQL_USER=revenue
MYSQL_PASSWORD=<same password as MySQL service>
MYSQL_DATABASE=revenue
```

In Render, open the MySQL/`revenue-mysql` service → copy **Internal hostname** into `MYSQL_HOST`.

3. Also set (required for Nest):

```text
FIELD_ENCRYPTION_KEY=<64 hex chars: openssl rand -hex 32>
APP_URL=https://revenue-backend-q2kk.onrender.com
PAY_URL=https://revenue-backend-q2kk.onrender.com
CORS_ORIGINS=https://revenue-backend-q2kk.onrender.com
API_URL=auto
NODE_ENV=production
```

4. Optional Paystack:

```text
PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
```

5. **Remove** Railway-style Redis refs if present (`${{Redis...}}`). Either link Render Redis `connectionString` as `REDIS_URL`, or omit Redis (app boots with inline notifications).

6. **Manual Deploy** the API.

7. Smoke test:

- https://revenue-backend-q2kk.onrender.com/api/v1/health → `"status":"ok"`
- https://revenue-backend-q2kk.onrender.com/docs

8. Seed once (Render Shell on the API service):

```bash
SEED_ON_BOOT=true
```

Redeploy once, then set `SEED_ON_BOOT=false`.

## Fullstack Blueprint

[`render.yaml`](../render.yaml) creates:

| Service | Role |
|---------|------|
| `revenue-api` | NestJS API |
| `revenue-web` | Next.js admin + `/pay` |
| `revenue-mysql` | MySQL 8 (Starter) |
| `revenue-redis` | Redis (free) |

After Web is live, set API:

```text
APP_URL=https://<revenue-web>.onrender.com
PAY_URL=https://<revenue-web>.onrender.com
CORS_ORIGINS=https://<revenue-web>.onrender.com
```

And Web:

```text
NEXT_PUBLIC_API_URL=https://revenue-backend-q2kk.onrender.com/api/v1
```

Then **redeploy Web** (NEXT_PUBLIC_* is build-time).
