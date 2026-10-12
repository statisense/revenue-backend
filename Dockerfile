# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json
COPY apps/pay/package.json ./apps/pay/package.json
COPY tests/package.json ./tests/package.json
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
RUN pnpm --filter @revenue/shared build \
 && pnpm --filter @revenue/config build \
 && pnpm --filter @revenue/database generate \
 && pnpm --filter @revenue/database build \
 && pnpm --filter @revenue/api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=build /app /app
COPY infra/docker/api-entrypoint.sh /app/infra/docker/api-entrypoint.sh
RUN chmod +x /app/infra/docker/api-entrypoint.sh \
  && sed -i 's/\r$//' /app/infra/docker/api-entrypoint.sh
EXPOSE 4000
CMD ["/app/infra/docker/api-entrypoint.sh"]
