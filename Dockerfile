# syntax=docker/dockerfile:1

# ===============================================
# Base Stage
# ===============================================
FROM node:24-alpine AS base

# Install pnpm (matching packageManager in package.json)
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

# Install dependencies needed for Prisma and build
RUN apk add --no-cache libc6-compat openssl

# ===============================================
# Dependencies Stage
# ===============================================
FROM base AS deps

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
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
COPY tooling/tailwind/package.json tooling/tailwind/
COPY tooling/typescript/package.json tooling/typescript/
COPY config/package.json config/
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# ===============================================
# Builder Stage
# ===============================================
FROM base AS builder

WORKDIR /app

# Copy all node_modules from deps stage (pnpm workspace structure)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/tooling ./tooling
COPY --from=deps /app/config ./config
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy source files
COPY . .

# Set dummy DATABASE_URL for Prisma client generation (not used for actual DB connection)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Generate Prisma client
RUN pnpm --filter @repo/database generate

# Build the application
ENV NODE_ENV=production

# Build arguments for public env vars (needed at build time)
ARG VITE_SITE_URL
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG SITE_URL
ARG AVATARS_BUCKET_NAME

ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV VITE_STRIPE_PUBLISHABLE_KEY=${VITE_STRIPE_PUBLISHABLE_KEY}
ENV SITE_URL=${SITE_URL}
ENV AVATARS_BUCKET_NAME=${AVATARS_BUCKET_NAME}

# Increase Node heap size for Nitro bundling
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Clean any stale build artifacts to prevent hash mismatches
RUN rm -rf apps/web/.output

# Cache bust argument - change this value to force a clean rebuild
ARG CACHE_BUST=4

RUN pnpm build

# ===============================================
# Production Runner Stage
# ===============================================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy the entire built application (preserves pnpm symlink structure)
# This is the most reliable approach for pnpm workspaces
COPY --from=builder --chown=appuser:nodejs /app ./

USER appuser

EXPOSE 3000

# Start the TanStack Start application with Nitro server
CMD ["node", "apps/web/.output/server/index.mjs"]
