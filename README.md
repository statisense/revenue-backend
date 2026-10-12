# Government Revenue Collection Platform

Single-tenant **Nigeria Customs (NCS)** revenue collection system: assessment â†’ invoice â†’ payment link / QR / virtual account â†’ webhook reconcile â†’ receipt â†’ TSA settlement.

## Stack

| Layer | Technology |
|-------|------------|
| API | NestJS modular monolith (`apps/api`) |
| Admin + Pay | Next.js (`apps/web`) :3000 — pay portal at `/pay` |
| Database | **MySQL 8** + Prisma |
| Queue | Redis + BullMQ, RabbitMQ |
| Gateways | Paystack, Flutterwave, Remita |

Tenant code: `TENANT_AGENCY_CODE=NCS`

## Phases covered

1. Architecture & monorepo structure  
2. MySQL schema & Prisma models  
3. Auth, RBAC, single-tenant foundation  
4. Revenue types & assessment engine  
5. Invoice engine  
6. Payment link & QR  
7. Virtual accounts  
8. Gateway adapters & webhooks  
9. Auto-reconciliation & TSA settlement  
10. Receipts & verification  
11. Notifications (SMS/Email/WhatsApp/Telegram)  
12. Reporting & analytics  
13. Audit, monitoring & logging  
14. Admin dashboard  
15. Tests, Docker, Kubernetes, CI/CD  
16. Documentation, OpenAPI, hardening  

## Quick start

```bash
cp .env.example .env
# Start Docker Desktop, then:
docker compose -f infra/docker/docker-compose.yml up -d mysql redis rabbitmq mailhog

pnpm install
pnpm --filter @revenue/shared build
pnpm --filter @revenue/config build
pnpm db:generate
pnpm --filter @revenue/database exec prisma migrate deploy
pnpm db:seed

pnpm --filter @revenue/api dev
pnpm --filter @revenue/web dev
```

- Swagger: http://localhost:4000/docs  
- Admin: http://localhost:3000  
- Pay (public, no login): http://localhost:3000/pay  

`apps/pay` is deprecated; the pay portal is part of `@revenue/web`.

## Railway (production fullstack)

You need **two** services from this repo — API alone is not the full app.

See **[`docs/railway.md`](docs/railway.md)** and **[`.env.railway.example`](./.env.railway.example)**.

| Service | Config-as-code |
|---------|----------------|
| `revenue-backend` | `/apps/api/railway.toml` |
| `revenue-web` | `/apps/web/railway.toml` |

Plus MySQL, Redis, and RabbitMQ plugins/services.

## Seed users (password `ChangeMe@12345`)

| Email | Role |
|-------|------|
| admin@ncs.gov.ng | Super admin |
| admin.finance@ncs.gov.ng | Agency admin |
| officer.apapa@ncs.gov.ng | Revenue officer |
| officer.tincan@ncs.gov.ng | Revenue officer |
| approver@ncs.gov.ng | Approver |
| treasury@ncs.gov.ng | Treasury |
| auditor@ncs.gov.ng | Auditor |
| cashier@ncs.gov.ng | Cashier |

Seed populates **all tables** with realistic NCS mock data (branches, assessments, invoices, VAs, payments, receipts, settlements, notifications, audit).

## Docs

See [`docs/`](docs/) for architecture, ERD, sequences, API, deployment, developer, admin, and user guides.

**Railway (production):** [`docs/railway.md`](docs/railway.md) — deploy API, admin, pay, MySQL, Redis, and RabbitMQ from this repo.
