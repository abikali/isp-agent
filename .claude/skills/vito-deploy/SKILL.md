---
name: vito-deploy
description: Deploy and manage the LibanCom ISP app on VitoDeploy. Use when the user asks to deploy, check deployment status, manage environment variables, view logs, manage workers, SSL certificates, create/delete sites, or any VitoDeploy server management task. Triggers include "deploy", "deploy to vito", "check deployment", "vito status", "update env", "restart worker", "add SSL", "create site", "vito logs", or any server/deployment management request.
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep
---

# VitoDeploy Management Skill for LibanCom ISP

> **Living Document:** This skill is continuously updated. Whenever you discover new findings during deployment, debugging, or server management — such as corrected API payloads, new endpoints, workarounds, gotchas, or infrastructure changes — update this file immediately so future invocations benefit from the latest knowledge.

## Infrastructure

| Resource | Value |
|----------|-------|
| Vito GUI | `https://vito.abiroot.dev` (161.35.72.42) |
| App Server | `159.223.220.101` (Ubuntu 24, Node 24, pnpm, nginx, PostgreSQL 17, Redis, Supervisor) |
| Project ID | `1` |
| Server ID | `1` |
| Source Control ID | `3` (GitHub - "Abiroot - New") — API field name is `source_control` (not `source_control_id`) |
| API Token | `3\|YB90hlOF7E0AqziuryggFdyblHGW2CcHt4qgQWwQ8f6a5e48` |
| SSH User | `libancom` |
| Repository | `abikali/isp-agent` |
| Branch | `main` |

## LibanCom Site Details

| Field | Value |
|-------|-------|
| Site ID | `21` |
| Domain | `libancom.abiroot.dev` (also `cp.libancomlb.com`) |
| Port | `3000` |
| User | `libancom` |
| Site Path | `/home/libancom/libancom.abiroot.dev` |
| App Dir | `/home/libancom/libancom.abiroot.dev/apps/web` |
| Web Log | `/home/libancom/.logs/workers/7.log` (supervisor program `7`) |
| Worker Log | `/home/libancom/.logs/workers/8.log` (supervisor program `8`) |
| Database | `libancom` (PostgreSQL 17, user: `libancom`) |
| DB Password | `0bJzvNbiLM9hAWzhGl9l7z6H` |
| DB Connect | `PGPASSWORD='0bJzvNbiLM9hAWzhGl9l7z6H' psql -U libancom -d libancom -h localhost` |

## API Authentication

All API calls use Bearer token auth:

```bash
VITO_URL="https://vito.abiroot.dev"
VITO_TOKEN="3|YB90hlOF7E0AqziuryggFdyblHGW2CcHt4qgQWwQ8f6a5e48"
VITO_PROJECT=1
VITO_SERVER=1
SITE_ID=21

# Helper function for API calls
vito_api() {
  local method="$1" endpoint="$2" data="$3"
  if [ -n "$data" ]; then
    curl -sk -X "$method" \
      -H "Authorization: Bearer $VITO_TOKEN" \
      -H "Accept: application/json" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$VITO_URL$endpoint"
  else
    curl -sk -X "$method" \
      -H "Authorization: Bearer $VITO_TOKEN" \
      -H "Accept: application/json" \
      "$VITO_URL$endpoint"
  fi
}
```

## Common Operations

### 1. Trigger Deployment

```bash
vito_api POST "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/deploy"
```

### 2. Check Deployment Status

```bash
# List recent deployments
vito_api GET "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/deployments"

# Check specific deployment
DEPLOYMENT_ID=<deployment_id>
vito_api GET "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/deployments/$DEPLOYMENT_ID"
```

Deployment statuses: `deploying`, `finished`, `failed`

### 3. Get/Update Deployment Script

```bash
# Get current script
vito_api GET "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/deployment-script"

# Update script (field name is "script", NOT "content")
vito_api PUT "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/deployment-script" '{
  "script": "cd $SITE_PATH\n..."
}'
```

### 4. Get/Update Environment Variables

```bash
# Get env
vito_api GET "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/env"

# Via SSH (recommended - avoids escaping issues)
ssh root@159.223.220.101 "cat /home/libancom/libancom.abiroot.dev/.env"

# Update via SSH
ssh root@159.223.220.101 "cat > /home/libancom/libancom.abiroot.dev/.env << 'EOF'
...
EOF
chown libancom:libancom /home/libancom/libancom.abiroot.dev/.env"
```

**Note:** The Vito API `env` field is a **string** (dotenv format), NOT a JSON object.

### 5. List/Manage Workers (Supervisor)

```bash
# List workers for site
vito_api GET "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/workers"

# Restart a worker
WORKER_ID=<worker_id>
vito_api POST "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/workers/$WORKER_ID/restart"

# Get worker logs
vito_api GET "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/workers/$WORKER_ID/logs"
```

### 6. Direct SSH Operations

```bash
# Check process status
ssh root@159.223.220.101 'supervisorctl status'

# View web server logs
ssh root@159.223.220.101 'tail -100 /home/libancom/.logs/workers/7.log'

# View worker logs
ssh root@159.223.220.101 'tail -100 /home/libancom/.logs/workers/8.log'

# Restart web server only
ssh root@159.223.220.101 'supervisorctl restart 7:7_00'

# Restart background worker only
ssh root@159.223.220.101 'supervisorctl restart 8:8_00'

# Check nginx config
ssh root@159.223.220.101 'cat /etc/nginx/sites-available/libancom.abiroot.dev'

# Check disk/memory
ssh root@159.223.220.101 'df -h && free -m'

# Database access
ssh root@159.223.220.101 "PGPASSWORD='0bJzvNbiLM9hAWzhGl9l7z6H' psql -U libancom -d libancom -h localhost"
```

### 7. Run Prisma Migrations

Migrations run automatically during deployment, but can be run manually:

```bash
ssh root@159.223.220.101 'cd /home/libancom/libancom.abiroot.dev && \
  sudo -u libancom bash -c "source .env && \
  pnpm --filter @repo/database exec prisma migrate deploy"'
```

### 8. SSL Certificate

```bash
# Let's Encrypt (for non-Cloudflare domains)
vito_api POST "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/sites/$SITE_ID/ssls/letsencrypt"
```

For Cloudflare-proxied domains, use a self-signed cert instead.

### 9. Manage Services

```bash
# List all services
vito_api GET "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/services"

# Restart nginx
SERVICE_ID=<service_id>
vito_api POST "/api/projects/$VITO_PROJECT/servers/$VITO_SERVER/services/$SERVICE_ID/restart"
```

## Deployment Script (Currently Active)

```bash
cd $SITE_PATH

set -e
set -a; source .env; set +a

export PNPM_HOME="/home/libancom/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Discard generated files that block pull (e.g. routeTree.gen.ts)
git checkout .

# Pull latest code
git pull origin $BRANCH

# Install deps
pnpm install --frozen-lockfile

# Generate Prisma client
pnpm --filter @repo/database generate

# Run pending migrations
pnpm --filter @repo/database migrate:deploy

# Swap in pre-built artifact from CI
rm -rf apps/web/.output
tar xzf /tmp/staging-build.tar.gz --exclude='._*' -C apps/web
chown -R libancom:libancom apps/web/.output
rm -f /tmp/staging-build.tar.gz

echo "Deployment completed successfully!"
```

**Note:** The build artifact (`staging-build.tar.gz`) is deployed to `/tmp/` by the CI/CD pipeline (GitHub Actions). The deploy script extracts it rather than building on the server.

## Supervisor Configs

### Web Server (Program 7)

File: `/etc/supervisor/conf.d/7.conf`

```ini
[program:7]
process_name=%(program_name)s_%(process_num)02d
directory=/home/libancom/libancom.abiroot.dev
command=bash /home/libancom/libancom.abiroot.dev/start-web.sh
autostart=true
autorestart=true
user=libancom
numprocs=1
redirect_stderr=true
stdout_logfile=/home/libancom/.logs/workers/7.log
stopwaitsecs=3600
stopasgroup=true
killasgroup=true
```

### Background Worker (Program 8)

File: `/etc/supervisor/conf.d/8.conf`

```ini
[program:8]
process_name=%(program_name)s_%(process_num)02d
directory=/home/libancom/libancom.abiroot.dev
command=bash /home/libancom/libancom.abiroot.dev/start-worker.sh
autostart=true
autorestart=true
user=libancom
numprocs=1
redirect_stderr=true
stdout_logfile=/home/libancom/.logs/workers/8.log
stopwaitsecs=3600
stopasgroup=true
killasgroup=true
```

## Start Scripts

### Web Server (`start-web.sh`)

```bash
#!/bin/bash
set -a
source "$(dirname "$0")/.env"
set +a
export PNPM_HOME="/home/libancom/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
cd "$(dirname "$0")"
exec node --import ./apps/web/.output/server/instrument.server.mjs apps/web/.output/server/index.mjs
```

### Background Worker (`start-worker.sh`)

```bash
#!/bin/bash
set -a
source "$(dirname "$0")/.env"
set +a
export PNPM_HOME="/home/libancom/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
cd "$(dirname "$0")/apps/worker"
exec node --import tsx ./index.ts
```

## Auto-Deploy

Auto-deploy may be enabled via GitHub webhook. Check status:

```bash
# Via Vito's DB
ssh root@161.35.72.42 'cd /home/vito/vito && php artisan tinker --execute="echo \App\Models\Site::find(21)->auto_deployment;"'
```

**Enable/Disable** (not available via REST API):
```bash
# Enable
ssh root@161.35.72.42 'cd /home/vito/vito && php artisan tinker --execute="\App\Models\Site::find(21)->enableAutoDeployment();"'

# Disable
ssh root@161.35.72.42 'cd /home/vito/vito && php artisan tinker --execute="\App\Models\Site::find(21)->disableAutoDeployment();"'
```

## Multi-Site Server Management

This Vito server hosts multiple websites. Key rules:

### Port Isolation

| Port | App | Supervisor Process |
|------|-----|--------------------|
| 3000 | **libancom** (cp.libancomlb.com) | 7:7_00 (web), 8:8_00 (worker) |
| 3001 | electrotechvision | electrotechvision |
| 3010 | tg-isp.abiroot.dev | 3:3_00 |
| 3011 | wup-hair-hunter | 4:4_00 |
| 3020 | laymoun (laymoun.abiroot.dev) | laymoun |

### CRITICAL: Never `supervisorctl restart all`
This causes a race condition where processes grab each other's ports on restart. Always restart only the specific process:
- Web: `supervisorctl restart 7:7_00`
- Worker: `supervisorctl restart 8:8_00`

### CRITICAL: Nginx MUST listen on port 443 for Cloudflare-proxied domains
Without `listen 443 ssl`, requests fall to the wrong site's SSL server block. Every Cloudflare-proxied site needs a cert (self-signed is fine with Cloudflare "Full" mode).

## Gotchas

1. **API field name is `source_control`** (not `source_control_id`) when creating sites
2. **API field name is `script`** (not `content`) when updating deployment scripts
3. **Env API field `env`** expects a **string** (dotenv format), not a JSON object
4. **`supervisorctl restart all` is dangerous** — causes port conflicts
5. **Build artifact comes from CI** — the deploy script expects `/tmp/staging-build.tar.gz` to exist (deployed by GitHub Actions)
6. **Worker runs TypeScript directly** via `node --import tsx` (not compiled)
7. **Web server uses `--import` for Sentry instrumentation** — must be in the node command, not `NODE_ENV`
8. **Deployment log location** — logs on Vito GUI server at `/home/vito/vito/storage/app/server-logs/`. Read via: `ssh root@161.35.72.42 'cat /home/vito/vito/storage/app/server-logs/<log-name>.log'`
9. **Database migrations run during deployment** — the deploy script includes `pnpm --filter @repo/database migrate:deploy`
