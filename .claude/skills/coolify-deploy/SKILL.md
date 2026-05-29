---
name: coolify-deploy
description: Deploy and manage the LibanCom ISP app on Coolify. Use when the user asks to deploy, check deployment status, manage environment variables, view logs, restart web/worker, run prod DB queries, run migrations, or any Coolify server/container management task for libancom. Triggers include "deploy", "deploy libancom", "check deployment", "coolify status", "prod db", "prod logs", "restart worker", "restart web", "prod query", "redeploy", or any server/deployment management request. Replaces the old vito-deploy skill (LibanCom moved off VitoDeploy → Coolify in May 2026).
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep
---

# Coolify Management Skill for LibanCom ISP

> **Living Document:** This skill is continuously updated. Whenever you discover new findings during deployment, debugging, or server management — corrected commands, new container names, gotchas, infra changes — update this file immediately so future invocations benefit.

> **Migration note (2026-05):** LibanCom moved off **VitoDeploy** onto **Coolify**. The old Vito app server (`159.223.220.101`) and the Vito panel (`161.35.72.42`) were **destroyed** — those IPs no longer respond. There is **no more nginx-per-site, no Supervisor**. Everything runs as Docker containers managed by Coolify, with **Traefik** as the reverse proxy. See `/Users/lamba/Documents/Infra/docs/MIGRATION_PLAN.md` for the broader consolidation context.

## Infrastructure

| Resource | Value |
|----------|-------|
| Coolify dashboard | `https://coolify.abiroot.dev` (control plane `209.38.37.194`, ams3, 1vCPU/2GB) |
| Coolify UI also on | `http://209.38.37.194:8000` |
| App node | **coolify-node-ams3-01** `209.38.103.160` (ams3, 4vCPU/8GB) — runs libancom + many other apps |
| Reverse proxy | `coolify-proxy` (Traefik v3.6) on the node, owns `:80`/`:443` |
| Repository | `abikali/isp-agent`, branch `main` |
| SSH (node) | `ssh root@209.38.103.160` |
| SSH (control plane) | `ssh root@209.38.37.194` |

**SSH note:** root SSH with the local default key works from a trusted IP. (DigitalOcean firewall / WireGuard egress `167.99.248.137` may gate access from other networks — if SSH times out, you're likely off the allowlisted network, not down. The web app being reachable while `:22` times out is the tell.)

## LibanCom on Coolify

The app is deployed as **two Coolify applications from the same repo image** (web + worker) plus a managed Postgres and Redis. All four live on `coolify-node-ams3-01`.

| Coolify resource | Image / base | Role | Start command |
|---|---|---|---|
| `libancom-web` | repo build (`/app`, Nitro output) | Web (SSR + oRPC API + AI web-chat/webhooks) | `node .output/server/index.mjs` (port 3000) |
| `libancom-worker` | same repo build | BullMQ background worker (email, webhook, **AI chat / WhatsApp+Telegram**, integration sync, watchers) | `pnpm --filter @repo/worker worker:prod` → `node --import tsx ./index.ts` |
| `libancom-db` | `pgvector/pgvector:pg17` | PostgreSQL 17 (db `libancom`) | — |
| `libancom-redis` | `redis:7.2` | Redis (sessions + BullMQ queues) | — |

**Domains routed to `libancom-web` (Traefik):** `cp.libancomlb.com`, `libancom.abiroot.dev`, `libancom-coolify.abiroot.dev` (all Cloudflare-proxied for the first two).

**Restart policy:** `unless-stopped`. No Docker healthcheck configured on web/worker.

## Connection Details

```bash
# Postgres (INTERNAL ONLY — not published to the host; reach it via docker exec or the container network)
#   user=postgres  db=libancom
#   password=40460b6cd8da283665add5a0d97abe6cd936cb08ae967139
DATABASE_URL=postgres://postgres:40460b6cd8da283665add5a0d97abe6cd936cb08ae967139@<db-container>:5432/libancom

# Redis (internal)
REDIS_URL=redis://default:33e272688b42a3c1fded07054f3032612c48e91bab97cd7e@<redis-container>:6379/0
```

> Secrets above are Coolify-generated. They are stable unless the resource is recreated. Rotate from the Coolify dashboard (resource → Environment Variables / the DB resource's credentials) if leaked. The DB is **not** exposed on a host port, so it's only reachable from inside the node.

## CRITICAL: Container names change on every deploy — resolve by label

Coolify container names look like `m11yfcihaaew3m23mi504ppp-171056026179`:
- the **UUID prefix** (`m11y…`) is stable per resource (= the `coolify.name` label),
- the **numeric suffix** is a per-deploy timestamp and **changes every redeploy**.

**Never hardcode the full container name.** Resolve it by the `coolify.resourceName` label:

```bash
NODE=root@209.38.103.160

# Get the current container name/id for a libancom resource
ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-web    --format "{{.Names}}"'
ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-worker --format "{{.Names}}"'
ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-db     --format "{{.Names}}"'
ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-redis  --format "{{.Names}}"'
```

Current names (snapshot — verify with the commands above before relying on them):
| resource | container (as of 2026-05-29) |
|---|---|
| libancom-web | `m11yfcihaaew3m23mi504ppp-171056026179` |
| libancom-worker | `n79kaggxprq28o8x8t5vthtk-174053569576` |
| libancom-db | `v9v02hrzi636xqiqh8qfk1mv` (DB/Redis have no deploy-suffix; they're persistent) |
| libancom-redis | `wggebh5fk6uo1mnt2ot9kyxp` |

## Common Operations

### 1. Production DB query (psql)

The DB port is internal-only, so go through the container:

```bash
NODE=root@209.38.103.160
DB=$(ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-db -q')

# One-off query (note -P pager=off; use -x for wide rows)
ssh $NODE "docker exec $DB psql -U postgres -d libancom -P pager=off -c 'SELECT count(*) FROM customer;'"

# Interactive session
ssh -t $NODE "docker exec -it $DB psql -U postgres -d libancom"
```

Quoting tip for camelCase columns through nested ssh: wrap the SQL in double quotes for `-c` and escape the identifier quotes, e.g. `... -c \"SELECT \\\"maintenanceMode\\\" FROM ai_agent;\"`.

### 2. Logs

```bash
NODE=root@209.38.103.160
WEB=$(ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-web -q')
WORKER=$(ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-worker -q')

ssh $NODE "docker logs --tail 200 -f $WEB"      # web / API
ssh $NODE "docker logs --tail 200 -f $WORKER"   # background worker (AI chat lives here)
```

Or use the Coolify dashboard → the resource → **Logs**.

### 3. Restart a service

Prefer the Coolify dashboard (resource → **Restart**) so Coolify stays in sync. From the node directly:

```bash
ssh $NODE "docker restart $WEB"
ssh $NODE "docker restart $WORKER"
```

Do **not** `docker restart coolify-proxy` casually — it's the shared Traefik for every app on the node.

### 4. Deploy / redeploy

Deploys are driven by **Coolify**, not a deploy script on the box. Options:

- **Dashboard:** open the `libancom-web` / `libancom-worker` resource → **Deploy** (or **Redeploy**). Coolify builds the image from the repo and rolls the container.
- **Git push:** if auto-deploy (GitHub webhook) is enabled on the resource, pushing to `main` triggers a build. Confirm in the resource's **Webhooks / Source** settings.
- **Deploy webhook / API:** each Coolify resource has a deploy webhook URL and the Coolify REST API supports `POST /api/v1/deploy`. Requires a Coolify API token (see below).

Build runs on the node; web + worker build from the same repo and run different start commands.

### 5. Run Prisma migrations

Migrations are expected to run as part of the build/release (check the resource's build/post-deploy commands in Coolify). To run manually:

```bash
WEB=$(ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-web -q')
ssh $NODE "docker exec $WEB sh -c 'cd /app && pnpm --filter @repo/database migrate:deploy'"
```

(Per project rule: never hand-write migration SQL; create migrations locally with `pnpm --filter @repo/database migrate` and let them deploy.)

### 6. Environment variables

Edit env in the Coolify dashboard (resource → **Environment Variables**) — Coolify owns the env and re-injects it on deploy. Editing the container's env directly is **not** durable (lost on next deploy). To read current values:

```bash
ssh $NODE "docker exec $WEB env | sort"
```

### 7. Coolify API (automation)

```bash
COOLIFY_URL="https://coolify.abiroot.dev"
# COOLIFY_TOKEN — NOT captured here. Create one in the dashboard:
#   Keys & Tokens → API tokens → create, then store securely.
curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_URL/api/v1/applications"
# Trigger a deploy:
curl -s -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_URL/api/v1/deploy?uuid=<app-uuid>"
```

The verified, dependency-free management path is **SSH + docker on the node** (above). Use the API only once a token is provisioned.

## Other apps sharing coolify-node-ams3-01 (blast radius)

The node is shared. Be careful with node-wide actions. Resources currently co-located (each with its own PG/Redis as applicable): `tikmonitor` (+worker/db/redis), `tamr` (+worker/db/redis), `barkode` (+db/redis), `electrotechvision` (+db), `rehabai` (+worker/db/redis), `zedinspect` (+postgres/redis), `myboss` (+redis, uses external bl1nk PG), `scan-hephon` (+db), `hephon`, `tg-isp` (+pgvector db), `libancomlb` (static landing site), `mail-setup`. Plus shared `coolify-proxy` (Traefik) and `coolify-sentinel`.

## Gotchas

1. **Vito is gone.** `159.223.220.101` / `161.35.72.42` are destroyed. Any old `vito-deploy` instructions, supervisor programs (`7:7_00`, `8:8_00`), `start-web.sh`/`start-worker.sh`, and `/home/libancom/...` paths are obsolete.
2. **Container names are not stable** — resolve by `coolify.resourceName` label every time (see above).
3. **DB is internal-only** — no host port. Use `docker exec <libancom-db> psql ...`; you can't `psql -h localhost` from the node shell.
4. **Worker runs TypeScript via `tsx`** (`node --import tsx ./index.ts`) — it executes source from `/app/packages/**` and `/app/apps/worker`, not a bundled artifact. The **web** app runs the built Nitro output (`/app/apps/web/.output/server/index.mjs`).
5. **AI chat / WhatsApp / Telegram responses are generated by `libancom-worker`** (BullMQ), not the web container. Debug AI behavior in the worker logs.
6. **Traefik owns :80/:443** on the node and routes by Host label. Don't stand up another :80/:443 listener; add domains via the Coolify resource's Domains field.
7. **Env edits must go through Coolify** to survive redeploys.
8. **App stays reachable via Cloudflare** even if SSH is firewalled from your network — don't assume "down" from an SSH timeout; curl the domain.

## Quick reference

```bash
NODE=root@209.38.103.160
WEB=$(ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-web -q')
WORKER=$(ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-worker -q')
DB=$(ssh $NODE 'docker ps --filter label=coolify.resourceName=libancom-db -q')

ssh $NODE "docker logs --tail 200 $WORKER"                                  # worker logs (AI chat)
ssh $NODE "docker exec $DB psql -U postgres -d libancom -P pager=off -c 'SELECT now();'"   # prod DB
ssh $NODE "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep libancom"             # libancom container status
```
