# syntax=docker/dockerfile:1
# libancom (@repo/web) — Coolify build. Adapted from the proven tamr/tikmonitor
# Nitro-monorepo template (abikali/abiroot share this skeleton). No tsyringe here
# (so no reflect-metadata), DB has no pgvector. Sentry instrument preload dropped
# (its deps aren't in the slim .output runner) — run plain .output/server/index.mjs.

# ===============================================
# Base
# ===============================================
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
RUN apk add --no-cache libc6-compat openssl

# ===============================================
# Dependencies
# ===============================================
FROM base AS deps
WORKDIR /app

COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

COPY package.json pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/ai/package.json packages/ai/
COPY packages/api/package.json packages/api/
COPY packages/audit/package.json packages/audit/
COPY packages/auth/package.json packages/auth/
COPY packages/database/package.json packages/database/
COPY packages/feature-flags/package.json packages/feature-flags/
COPY packages/i18n/package.json packages/i18n/
COPY packages/integrations/package.json packages/integrations/
COPY packages/jobs/package.json packages/jobs/
COPY packages/logs/package.json packages/logs/
COPY packages/mail/package.json packages/mail/
COPY packages/notifications/package.json packages/notifications/
COPY packages/payments/package.json packages/payments/
COPY packages/quotas/package.json packages/quotas/
COPY packages/rate-limit/package.json packages/rate-limit/
COPY packages/security/package.json packages/security/
COPY packages/storage/package.json packages/storage/
COPY packages/utils/package.json packages/utils/
COPY packages/webhooks/package.json packages/webhooks/
COPY tooling/scripts/package.json tooling/scripts/
COPY tooling/tailwind/package.json tooling/tailwind/
COPY tooling/typescript/package.json tooling/typescript/
COPY config/package.json config/
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# ===============================================
# Builder
# ===============================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/tooling ./tooling
COPY --from=deps /app/config ./config
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY package.json pnpm-workspace.yaml turbo.json .npmrc ./
COPY config/ ./config/
COPY tooling/ ./tooling/
COPY packages/ ./packages/
COPY apps/ ./apps/

# Prisma client (no real DB needed for generate)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm --filter @repo/database generate

ENV NODE_ENV=production

# Client env baked by Vite at build — only declared ARGs reach the bundle.
ARG VITE_SITE_URL
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_NANGO_HOST
ARG VITE_NANGO_PUBLIC_KEY
ARG VITE_SENTRY_DSN
ARG SITE_URL
ARG AVATARS_BUCKET_NAME
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV VITE_STRIPE_PUBLISHABLE_KEY=${VITE_STRIPE_PUBLISHABLE_KEY}
ENV VITE_VAPID_PUBLIC_KEY=${VITE_VAPID_PUBLIC_KEY}
ENV VITE_NANGO_HOST=${VITE_NANGO_HOST}
ENV VITE_NANGO_PUBLIC_KEY=${VITE_NANGO_PUBLIC_KEY}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV SITE_URL=${SITE_URL}
ENV AVATARS_BUCKET_NAME=${AVATARS_BUCKET_NAME}
ENV NODE_OPTIONS="--max-old-space-size=8192"

RUN rm -rf apps/web/.output
RUN pnpm build

# ===============================================
# Runner
# ===============================================
FROM node:24-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:nodejs /app/apps/web/.output ./.output

# sharp is a native module pulled into the SSR bundle (via @repo/jobs/storage)
# and can't be bundled into .output; the slim runner has no node_modules.
RUN cd /app && npm install --no-save --no-package-lock sharp@0.34.5 \
    && chown -R appuser:nodejs /app/node_modules

USER appuser
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
