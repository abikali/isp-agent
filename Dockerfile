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

# NB: do NOT copy the repo .npmrc (public-hoist-pattern=*prisma*) — it perturbs
# pnpm hoisting so build scripts (prisma/sharp) get ignored -> `prisma: not found`
# at generate. Matching tamr (no .npmrc) lets onlyBuiltDependencies run normally.
COPY package.json pnpm-workspace.yaml turbo.json ./
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
# apps/worker manifest too: the unified `worker` stage (FROM builder) runs it via
# tsx, so its workspace deps must be installed in this shared deps/install layer.
COPY apps/worker/package.json apps/worker/

# --no-frozen-lockfile: the pnpm.overrides vite->rolldown-vite alias isn't in the
# committed lockfile yet, so let pnpm resolve it (network available at build).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --no-frozen-lockfile --prefer-offline

# ===============================================
# Source Stage — everything BOTH targets need, and nothing either doesn't
# ===============================================
# Split out of `builder` so the worker does not have to wait for (or cache-
# restore) the web bundle. `builder` continues from here and adds `pnpm build`;
# `worker-deploy` branches off HERE instead, because the worker runs its entry
# .ts through tsx at runtime and never reads the web output. The only thing it
# needs from this stage is the generated Prisma client, produced below — before
# the web build. BuildKit shares this stage between both targets, so nothing is
# built twice.
FROM base AS source
WORKDIR /app

# Carry the entire installed workspace from deps (root + per-package node_modules,
# whatever layout pnpm chose), then overlay source on top (source has no node_modules).
COPY --from=deps /app ./

# Everything EXCEPT apps/web's source, which lands in `builder` instead. This was
# a blanket `COPY . .`, which meant editing a single web route invalidated this
# layer and made worker-deploy re-run its ~480-package `pnpm deploy` for a
# byte-identical result. apps/web's MANIFEST still has to be here: pnpm-workspace
# globs apps/*, and the lockfile lists apps/web as an importer, so `pnpm deploy`
# needs it to resolve the workspace graph.
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY biome.json knip.json doctor.config.json Makefile ./
COPY config/ ./config/
COPY tooling/ ./tooling/
COPY packages/ ./packages/
COPY scripts/ ./scripts/
COPY infra/ ./infra/
COPY apps/worker/ ./apps/worker/
COPY apps/web/package.json ./apps/web/

# Prisma client (no real DB needed for generate)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm --filter @repo/database generate

# ===============================================
# Builder Stage (web only, from here down)
# ===============================================
FROM source AS builder

WORKDIR /app

# The web app's source lands here rather than in `source`, so touching a route
# or a component leaves the worker's cached layers intact. Its node_modules
# already arrived with the `COPY --from=deps /app ./` in source.
COPY apps/web/ ./apps/web/

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
# worker-1 is an 8GB box already running ~29 containers (~4GB used). The default
# `turbo build` runs packages in PARALLEL, each node able to grab up to the heap
# cap -> overcommits RAM -> swap-thrash (build crawled 13min+). Serialize turbo
# and cap the heap so one bounded build runs at a time and fits in available RAM.
ENV TURBO_CONCURRENCY=1
# Cap heap at 3072 so it fits in worker-1's free RAM (no swap-thrash) and any
# overrun fails CLEANLY (bounded RSS) instead of taking the box unreachable.
# Paired with brotli-off + maxParallelFileOps=2 (vite config) to cut the peak.
ENV NODE_OPTIONS="--max-old-space-size=3072"

RUN rm -rf apps/web/.output
# Turbo remote cache (R2-backed Worker): task outputs are restored from / stored to
# the remote cache by content hash, so unchanged packages (and identical re-runs /
# rollbacks) skip rebuilding across ephemeral CI runners. TURBO_TOKEN is passed as a
# BuildKit secret so it never lands in an image layer; when it's absent (local
# builds) turbo just runs without the remote cache. The local .turbo mount still
# de-dupes work within a single build.
ENV TURBO_API="https://turbo-cache.webteam-581.workers.dev"
ENV TURBO_TEAM="libancom"
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    --mount=type=secret,id=turbo_token \
    TURBO_TOKEN="$(cat /run/secrets/turbo_token 2>/dev/null || true)" \
    pnpm build

# ===============================================
# Production Runner Stage (web)
# ===============================================
FROM node:24-alpine AS web
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# sharp (native, pulled into the SSR bundle via @repo/jobs/storage) and
# reflect-metadata (tsyringe polyfill for @repo/auth) aren't in the slim .output
# runner — install them here. On alpine sharp pulls the linuxmusl-x64 prebuilt;
# resolved from /app/node_modules at runtime (cwd=/app).
RUN cd /app && npm install --no-save --no-package-lock sharp@0.34.5 reflect-metadata \
    && chown -R appuser:nodejs /app/node_modules

COPY --from=builder --chown=appuser:nodejs /app/apps/web/.output ./.output

# Preload reflect-metadata at RUNTIME (set AFTER the npm install above — otherwise
# npm itself crashes trying to --require a not-yet-installed module). @repo/auth
# uses tsyringe DI which 500s without it. NB: keep NODE_OPTIONS OUT of Coolify
# build env (it poisons the dockerfile build).
ENV NODE_OPTIONS="--require reflect-metadata"

USER appuser
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

# ===============================================
# Worker Runner Stage (background jobs)
# ===============================================
# Resolve ONLY the @repo/worker dependency graph into a standalone tree.
#
# The worker used to be `FROM builder`, which shipped the ENTIRE monorepo
# node_modules — the whole web dependency graph rode along for a process that
# runs background jobs and serves no UI. Two separate costs: the tree itself,
# and a `chown -R /app` on top of builder that wrote a full duplicate of /app as
# its own layer. On the sibling apps this pattern took images from ~7GB to ~1GB
# and worker deploys from ~220s to ~80s.
#
# --legacy is required: the workspace does not set inject-workspace-packages.
#
# --prod drops devDependencies. tsx survives because it is already a real
# dependency of apps/worker (it must be — the CMD is `node --import tsx`, and
# every @repo/* package exports raw .ts with no build step, so the worker
# transpiles source at boot). `prisma` is added as a dependency for the same
# reason — see the migration note below.
# NB `FROM source`, NOT `FROM builder`: branching before `pnpm build` means the
# worker image never waits for the web bundle it would immediately discard.
FROM source AS worker-deploy
WORKDIR /app
ENV NODE_ENV=production
RUN pnpm deploy --filter @repo/worker --prod --legacy /tmp/worker

# `pnpm deploy` materialises a FRESH tree, so the Prisma client the builder
# generated does not come along and @repo/database fails at import with
# ERR_MODULE_NOT_FOUND on prisma/generated/client.
RUN DEST="$(ls -d /tmp/worker/node_modules/.pnpm/@repo+database@*/node_modules/@repo/database)" && \
    cp -R /app/packages/database/prisma/generated "$DEST/prisma/generated"

# Fresh runner — does NOT inherit builder's layers, so nothing from the web
# build survives into the shipped image.
FROM base AS worker

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

# --chown during the copy: a separate recursive chown would write a full
# duplicate of the tree as its own layer.
COPY --from=worker-deploy --chown=worker:nodejs /tmp/worker ./
USER worker

# The fresh runner does not inherit builder's ENVs; re-declare the ones the
# worker has always run with so behaviour is unchanged.
ARG AVATARS_BUCKET_NAME
ENV AVATARS_BUCKET_NAME=${AVATARS_BUCKET_NAME}
# Heap ceiling, set from measurement rather than inherited from the builder
# (which legitimately needs a large heap for the Vite build). Workers on this
# node actually use 45-406MB resident; 8192 is 20-180x that and exceeds the
# box's total RAM, so a runaway job could take the whole node down instead of
# failing its own process. 2048 keeps ~5x headroom over the largest observed
# worker while bounding the blast radius. One line to raise if a job needs more.
ENV NODE_OPTIONS="--max-old-space-size=2048"

# ⚠️ MIGRATIONS: Coolify's post_deployment_command runs `prisma migrate deploy`.
# In this slim tree /app IS the worker package, so the old
# `pnpm --filter @repo/database migrate:deploy` matches no project and exits 0 —
# a SILENT no-op that would ship code against an unmigrated database. It must
# become, and prisma must be a dependency of THIS package for the bin to resolve
# at /app/node_modules/.bin (declared on @repo/database it lands under a hashed
# .pnpm path that changes on any dependency bump):
#   cd /app/node_modules/@repo/database && \
#     /app/node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma
# The `cd` is load-bearing: schema.prisma carries no datasource url, it comes
# from prisma.config.ts which the CLI resolves relative to the WORKING DIRECTORY.
#
# Entry point is index.ts here, not worker.ts like the sibling apps. Invoking
# node directly also avoids corepack downloading pnpm from the registry at every
# container start, and `pnpm run`'s dep-status check hitting EACCES on /app.

EXPOSE 9091

# Worker health. The entry file now binds a node:http liveness server on :9091 as
# the FIRST thing main() does, before any queue or scheduler setup, so this
# reports healthy through a cold boot rather than looking dead.
#
# Why bother: without it a wedged worker — event loop blocked, queues not
# draining — keeps its container in `Up` and is completely invisible. A
# crash-loop at least shows as `Restarting`.
#
# Liveness-only and deliberately NOT wired to a restart: Docker marks the
# container unhealthy but does not restart it, which is what we want on an
# IO-pressured node. 30s/3 detects a hang in ~90s without restart churn from a
# transient blip.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=60s \
  CMD wget -qO- http://127.0.0.1:9091/health || exit 1

CMD ["node", "--import", "tsx", "./index.ts"]
