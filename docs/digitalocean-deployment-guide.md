# LibanCom DigitalOcean Deployment Guide

Complete step-by-step guide to deploy LibanCom on DigitalOcean with atomic zero-downtime deployments via GitHub Actions.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [DigitalOcean Infrastructure Setup](#digitalocean-infrastructure-setup)
4. [Server Configuration](#server-configuration)
5. [Docker Compose Configuration](#docker-compose-configuration)
6. [Cloudflare DNS Setup](#cloudflare-dns-setup)
7. [GitHub Container Registry Setup](#github-container-registry-setup)
8. [GitHub Actions CI/CD Pipeline](#github-actions-cicd-pipeline)
9. [Deployment Process](#deployment-process)
10. [Monitoring & Maintenance](#monitoring--maintenance)
11. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Split Droplet Architecture (Option B)

This deployment uses two droplets for optimal resource allocation and security:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Cloudflare (Proxy)   │
                    │   - SSL Termination    │
                    │   - DDoS Protection    │
                    │   - CDN Caching        │
                    └───────────┬───────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                    DigitalOcean VPC (Private Network)                │
│                         10.116.0.0/20                                │
│                                                                      │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐ │
│  │     APP DROPLET             │    │     DATA DROPLET            │ │
│  │     s-2vcpu-4gb ($24/mo)    │    │     s-4vcpu-8gb ($48/mo)    │ │
│  │     10.116.0.2              │    │     10.116.0.3              │ │
│  │                             │    │                             │ │
│  │  ┌─────────────────────┐   │    │  ┌─────────────────────┐   │ │
│  │  │ Nginx (80/443)      │   │    │  │ PostgreSQL (5432)   │   │ │
│  │  │ - Reverse Proxy     │   │    │  │ - pgvector          │   │ │
│  │  │ - SSL (Cloudflare)  │   │    │  │ - libancom, langfuse,  │   │ │
│  │  └─────────────────────┘   │    │  │   litellm DBs       │   │ │
│  │                             │    │  └─────────────────────┘   │ │
│  │  ┌─────────────────────┐   │    │                             │ │
│  │  │ Web App (3000)      │   │    │  ┌─────────────────────┐   │ │
│  │  │ - TanStack Start    │   │    │  │ Redis (6379)        │   │ │
│  │  │ - Nitro Server      │   │    │  │ - Sessions          │   │ │
│  │  └─────────────────────┘   │    │  │ - Rate Limiting     │   │ │
│  │                             │    │  │ - BullMQ Queues     │   │ │
│  │  ┌─────────────────────┐   │    │  └─────────────────────┘   │ │
│  │  │ Worker              │   │    │                             │ │
│  │  │ - BullMQ Processor  │   │    │  ┌─────────────────────┐   │ │
│  │  └─────────────────────┘   │    │  │ ClickHouse          │   │ │
│  │                             │    │  │ (8123/9000)         │   │ │
│  │  ┌─────────────────────┐   │    │  │ - Langfuse Analytics│   │ │
│  │  │ LiteLLM (4000)      │   │    │  └─────────────────────┘   │ │
│  │  │ - LLM Gateway       │   │    │                             │ │
│  │  └─────────────────────┘   │    │  ┌─────────────────────┐   │ │
│  │                             │    │  │ MinIO (9000/9001)   │   │ │
│  └─────────────────────────────┘    │  │ - Blob Storage      │   │ │
│                                      │  └─────────────────────┘   │ │
│                                      │                             │ │
│                                      │  ┌─────────────────────┐   │ │
│                                      │  │ Langfuse (3001)     │   │ │
│                                      │  │ - LLM Observability │   │ │
│                                      │  └─────────────────────┘   │ │
│                                      │                             │ │
│                                      │  ┌─────────────────────┐   │ │
│                                      │  │ Langfuse Worker     │   │ │
│                                      │  │ - Trace Processor   │   │ │
│                                      │  └─────────────────────┘   │ │
│                                      └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Cost Breakdown

| Component | Specification | Monthly Cost |
|-----------|---------------|--------------|
| App Droplet | s-2vcpu-4gb (2 vCPU, 4GB RAM, 80GB SSD) | $24 |
| Data Droplet | s-4vcpu-8gb (4 vCPU, 8GB RAM, 160GB SSD) | $48 |
| VPC | Private networking | Free |
| Cloud Firewall | Network-level firewall | Free |
| Snapshots | Weekly backups (~20GB) | ~$2 |
| **Total** | | **~$74/mo** |

### Service Distribution

| Droplet | Services | Ports (Internal) |
|---------|----------|------------------|
| **App Droplet** | Nginx, Web, Worker, LiteLLM | 80, 443, 3000, 4000 |
| **Data Droplet** | PostgreSQL, Redis, ClickHouse, MinIO, Langfuse, Langfuse Worker | 5432, 6379, 8123, 9000, 9001, 3001 |

---

## Prerequisites

Before starting, ensure you have:

- [ ] DigitalOcean account with billing set up
- [ ] GitHub repository with the LibanCom codebase
- [ ] Cloudflare account (free tier works)
- [ ] Domain name configured with Cloudflare DNS
- [ ] API keys for: OpenAI, Anthropic, Google AI, Resend, Cloudflare R2, Stripe (optional)
- [ ] Local machine with `doctl` CLI installed (optional but recommended)

### Install DigitalOcean CLI (Optional)

```bash
# macOS
brew install doctl

# Linux
snap install doctl

# Authenticate
doctl auth init
```

---

## DigitalOcean Infrastructure Setup

### Step 1: Create a VPC Network

1. Go to **Networking** → **VPC** in DigitalOcean dashboard
2. Click **Create VPC Network**
3. Configure:
   - **Name**: `libancom-vpc`
   - **Region**: Choose your preferred region (e.g., `nyc1`, `sfo3`, `ams3`)
   - **IP Range**: `10.116.0.0/20` (default)
4. Click **Create VPC Network**

> **Note**: Since October 2020, all new Droplets are automatically added to a regional VPC. Creating a named VPC gives you better control.

### Step 2: Create SSH Keys

Generate a deployment SSH key for GitHub Actions:

```bash
# Generate ed25519 key (most secure)
ssh-keygen -t ed25519 -a 200 -C "github-actions@libancom.co" -f ~/.ssh/libancom-deploy -N ""

# View public key (add to DigitalOcean)
cat ~/.ssh/libancom-deploy.pub

# View private key (add to GitHub Secrets)
cat ~/.ssh/libancom-deploy
```

Add the **public key** to DigitalOcean:
1. Go to **Settings** → **Security** → **SSH Keys**
2. Click **Add SSH Key**
3. Paste the contents of `~/.ssh/libancom-deploy.pub`
4. Name it `libancom-deploy`

### Step 3: Create the Data Droplet

1. Go to **Droplets** → **Create Droplet**
2. Configure:
   - **Region**: Same as your VPC (e.g., `NYC1`)
   - **Image**: Ubuntu 24.04 (LTS) x64
   - **Size**: Shared CPU → Regular → **s-4vcpu-8gb** ($48/mo)
   - **VPC**: Select `libancom-vpc`
   - **Authentication**: SSH Key → Select `libancom-deploy`
   - **Hostname**: `libancom-data`
   - **Tags**: `libancom`, `data`, `production`
3. Click **Create Droplet**
4. Note the **Private IP** (e.g., `10.116.0.3`)

### Step 4: Create the App Droplet

1. Go to **Droplets** → **Create Droplet**
2. Configure:
   - **Region**: Same as your VPC
   - **Image**: Ubuntu 24.04 (LTS) x64
   - **Size**: Shared CPU → Regular → **s-2vcpu-4gb** ($24/mo)
   - **VPC**: Select `libancom-vpc`
   - **Authentication**: SSH Key → Select `libancom-deploy`
   - **Hostname**: `libancom-app`
   - **Tags**: `libancom`, `app`, `production`
3. Click **Create Droplet**
4. Note both the **Public IP** and **Private IP**

### Step 5: Configure Cloud Firewall

Create two firewalls - one for each droplet type:

#### App Droplet Firewall

1. Go to **Networking** → **Firewalls** → **Create Firewall**
2. **Name**: `libancom-app-firewall`
3. **Inbound Rules**:

| Type | Protocol | Port Range | Sources |
|------|----------|------------|---------|
| SSH | TCP | 22 | Your IP / Office IPs |
| HTTP | TCP | 80 | All IPv4, All IPv6 |
| HTTPS | TCP | 443 | All IPv4, All IPv6 |

4. **Outbound Rules**: Allow all (default)
5. **Apply to Droplets**: Select `libancom-app` or tag `app`
6. Click **Create Firewall**

#### Data Droplet Firewall

1. Create another firewall named `libancom-data-firewall`
2. **Inbound Rules**:

| Type | Protocol | Port Range | Sources |
|------|----------|------------|---------|
| SSH | TCP | 22 | Your IP / Office IPs |
| Custom | TCP | 5432 | `10.116.0.0/20` (VPC only) |
| Custom | TCP | 6379 | `10.116.0.0/20` (VPC only) |
| Custom | TCP | 8123 | `10.116.0.0/20` (VPC only) |
| Custom | TCP | 9000-9001 | `10.116.0.0/20` (VPC only) |
| Custom | TCP | 3001 | `10.116.0.0/20` (VPC only) |

3. **Apply to Droplets**: Select `libancom-data` or tag `data`
4. Click **Create Firewall**

> **Security Note**: The data droplet is only accessible from within the VPC. No public internet access to databases.

---

## Server Configuration

### Step 1: Initial Server Setup (Both Droplets)

SSH into each droplet and run:

```bash
# SSH into droplet
ssh -i ~/.ssh/libancom-deploy root@<DROPLET_PUBLIC_IP>

# Update system
apt update && apt upgrade -y

# Install essential packages
apt install -y \
  curl \
  wget \
  git \
  htop \
  ncdu \
  ufw \
  fail2ban \
  unattended-upgrades

# Configure automatic security updates
dpkg-reconfigure -plow unattended-upgrades

# Create deploy user
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# Allow deploy user to sudo without password (for deployments)
echo "deploy ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/deploy

# Set up SSH for deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Disable root SSH login (after verifying deploy user works)
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

### Step 2: Install Docker (Both Droplets)

```bash
# Install Docker using official script
curl -fsSL https://get.docker.com | sh

# Add deploy user to docker group
usermod -aG docker deploy

# Enable Docker to start on boot
systemctl enable docker

# Verify installation
docker --version
docker compose version
```

### Step 3: Install docker-rollout Plugin (App Droplet Only)

```bash
# Switch to deploy user
su - deploy

# Create Docker CLI plugins directory
mkdir -p ~/.docker/cli-plugins

# Download docker-rollout
curl -L https://raw.githubusercontent.com/wowu/docker-rollout/master/docker-rollout \
  -o ~/.docker/cli-plugins/docker-rollout

# Make executable
chmod +x ~/.docker/cli-plugins/docker-rollout

# Verify installation
docker rollout --help
```

### Step 4: Create Application Directory Structure

#### On Data Droplet:

```bash
su - deploy

# Create directories
mkdir -p ~/libancom/{config/postgres,data}
cd ~/libancom

# Create PostgreSQL init script
cat > config/postgres/init-databases.sql << 'EOF'
-- Create additional databases for services
CREATE DATABASE langfuse;
CREATE DATABASE litellm;
EOF
```

#### On App Droplet:

```bash
su - deploy

# Create directories
mkdir -p ~/libancom/{config/nginx/certs,config/litellm}
cd ~/libancom
```

---

## Docker Compose Configuration

### Data Droplet: `docker-compose.data.yml`

Create on the **Data Droplet** at `~/libancom/docker-compose.data.yml`:

```yaml
# Data Droplet Docker Compose Configuration
# Contains: PostgreSQL, Redis, ClickHouse, MinIO, Langfuse

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: libancom-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-libancom}
    ports:
      - "10.116.0.3:5432:5432"  # Replace with actual private IP
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./config/postgres:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - libancom-data

  redis:
    image: redis:7-alpine
    container_name: libancom-redis
    restart: unless-stopped
    ports:
      - "10.116.0.3:6379:6379"  # Replace with actual private IP
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 1gb --maxmemory-policy volatile-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - libancom-data

  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    container_name: libancom-clickhouse
    restart: unless-stopped
    user: "101:101"
    environment:
      CLICKHOUSE_DB: default
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:-langfuse}
    ports:
      - "10.116.0.3:8123:8123"  # Replace with actual private IP
      - "10.116.0.3:9000:9000"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - clickhouse_logs:/var/log/clickhouse-server
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8123/ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - libancom-data

  minio:
    image: minio/minio:latest
    container_name: libancom-minio
    restart: unless-stopped
    entrypoint: sh
    command: -c 'mkdir -p /data/langfuse && minio server /data --console-address ":9001"'
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minio}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports:
      - "10.116.0.3:9002:9000"  # S3 API - Replace with actual private IP
      - "10.116.0.3:9001:9001"  # Console
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - libancom-data

  langfuse:
    image: langfuse/langfuse:latest
    container_name: libancom-langfuse
    restart: unless-stopped
    ports:
      - "10.116.0.3:3001:3000"  # Replace with actual private IP
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/langfuse
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:-langfuse}
      CLICKHOUSE_CLUSTER_ENABLED: "false"
      REDIS_HOST: redis
      REDIS_PORT: 6379
      LANGFUSE_S3_EVENT_UPLOAD_ENABLED: "true"
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-minio}
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_ENABLED: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_REGION: auto
      LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-minio}
      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true"
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      NEXTAUTH_URL: ${LANGFUSE_URL}
      TELEMETRY_ENABLED: "false"
    depends_on:
      postgres:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/public/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - libancom-data

  langfuse-worker:
    image: langfuse/langfuse-worker:latest
    container_name: libancom-langfuse-worker
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/langfuse
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:-langfuse}
      CLICKHOUSE_CLUSTER_ENABLED: "false"
      REDIS_HOST: redis
      REDIS_PORT: 6379
      LANGFUSE_S3_EVENT_UPLOAD_ENABLED: "true"
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-minio}
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      NEXTAUTH_URL: ${LANGFUSE_URL}
      TELEMETRY_ENABLED: "false"
    depends_on:
      langfuse:
        condition: service_healthy
    networks:
      - libancom-data

volumes:
  postgres_data:
  redis_data:
  clickhouse_data:
  clickhouse_logs:
  minio_data:

networks:
  libancom-data:
    driver: bridge
```

### App Droplet: `docker-compose.app.yml`

Create on the **App Droplet** at `~/libancom/docker-compose.app.yml`:

```yaml
# App Droplet Docker Compose Configuration
# Contains: Nginx, Web App, Worker, LiteLLM

services:
  nginx:
    image: nginx:alpine
    container_name: libancom-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./config/nginx/certs:/etc/nginx/certs:ro
    depends_on:
      web:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - libancom-app

  web:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/libancom-web:${IMAGE_TAG:-latest}
    # For zero-downtime deployments, do NOT use container_name
    # container_name: libancom-web
    restart: unless-stopped
    expose:
      - "3000"
    env_file:
      - .env.production
    environment:
      NODE_ENV: production
      PORT: 3000
      HOST: 0.0.0.0
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${DATA_DROPLET_IP}:5432/${POSTGRES_DB:-libancom}
      REDIS_URL: redis://${DATA_DROPLET_IP}:6379
      BETTER_AUTH_URL: ${VITE_SITE_URL}
      LITELLM_API_URL: http://litellm:4000
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 10s
      timeout: 10s
      retries: 5
      start_period: 30s
    deploy:
      replicas: 1
    networks:
      - libancom-app

  worker:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/libancom-worker:${IMAGE_TAG:-latest}
    container_name: libancom-worker
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${DATA_DROPLET_IP}:5432/${POSTGRES_DB:-libancom}
      REDIS_URL: redis://${DATA_DROPLET_IP}:6379
    depends_on:
      web:
        condition: service_healthy
    networks:
      - libancom-app

  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: libancom-litellm
    restart: unless-stopped
    expose:
      - "4000"
    env_file:
      - .env.production
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${DATA_DROPLET_IP}:5432/litellm
      LANGFUSE_HOST: http://${DATA_DROPLET_IP}:3001
    volumes:
      - ./config/litellm/config.yaml:/app/config.yaml:ro
    command: ["--config", "/app/config.yaml"]
    healthcheck:
      test: ["CMD-SHELL", "python3 -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/readiness')\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - libancom-app

networks:
  libancom-app:
    driver: bridge
```

### Nginx Configuration

Create on **App Droplet** at `~/libancom/config/nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    # Upstream for web app (supports multiple instances for zero-downtime)
    upstream web_backend {
        least_conn;
        server web:3000;
    }

    upstream litellm_backend {
        server litellm:4000;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name _;

        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # Main HTTPS server
    server {
        listen 443 ssl;
        http2 on;
        server_name libancom.co www.libancom.co;

        # Cloudflare Origin Certificate
        ssl_certificate /etc/nginx/certs/origin.pem;
        ssl_certificate_key /etc/nginx/certs/origin.key;

        # SSL settings for Cloudflare Full (Strict)
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Gzip compression
        gzip on;
        gzip_vary on;
        gzip_proxied any;
        gzip_comp_level 6;
        gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # API routes
        location /api/ {
            proxy_pass http://web_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
        }

        # LiteLLM API (if exposed externally - optional)
        location /llm/ {
            proxy_pass http://litellm_backend/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }

        # Default - serve web app
        location / {
            proxy_pass http://web_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }

    # Langfuse subdomain (optional - for internal access)
    server {
        listen 443 ssl;
        http2 on;
        server_name langfuse.libancom.co;

        ssl_certificate /etc/nginx/certs/origin.pem;
        ssl_certificate_key /etc/nginx/certs/origin.key;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            # Proxy to Langfuse on data droplet
            proxy_pass http://${DATA_DROPLET_IP}:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### LiteLLM Configuration

Create on **App Droplet** at `~/libancom/config/litellm/config.yaml`:

```yaml
model_list:
  # OpenAI Models
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gpt-4-turbo
    litellm_params:
      model: openai/gpt-4-turbo
      api_key: os.environ/OPENAI_API_KEY

  # Anthropic Models
  - model_name: claude-sonnet-4-20250514
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-3-5-sonnet-20241022
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-3-5-haiku-20241022
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

  # Google Models
  - model_name: gemini-2.0-flash
    litellm_params:
      model: gemini/gemini-2.0-flash-exp
      api_key: os.environ/GOOGLE_API_KEY

  - model_name: gemini-1.5-pro
    litellm_params:
      model: gemini/gemini-1.5-pro
      api_key: os.environ/GOOGLE_API_KEY

litellm_settings:
  drop_params: true
  set_verbose: false
  success_callback: ["langfuse"]
  failure_callback: ["langfuse"]

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
```

---

## Environment Configuration

### Data Droplet: `.env.production`

Create at `~/libancom/.env.production` on **Data Droplet**:

```bash
# ========== Database ==========
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<GENERATE: openssl rand -base64 32>
POSTGRES_DB=libancom

# ========== ClickHouse ==========
CLICKHOUSE_PASSWORD=<GENERATE: openssl rand -base64 24>

# ========== MinIO ==========
MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=<GENERATE: openssl rand -base64 24>

# ========== Langfuse ==========
LANGFUSE_URL=https://langfuse.libancom.co
LANGFUSE_NEXTAUTH_SECRET=<GENERATE: openssl rand -base64 32>
LANGFUSE_SALT=<GENERATE: openssl rand -base64 32>
LANGFUSE_ENCRYPTION_KEY=<GENERATE: openssl rand -hex 32>
```

### App Droplet: `.env.production`

Create at `~/libancom/.env.production` on **App Droplet**:

```bash
# ========== Infrastructure IPs ==========
DATA_DROPLET_IP=10.116.0.3  # Replace with actual private IP
GITHUB_REPOSITORY_OWNER=your-github-username

# ========== Database ==========
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<SAME_AS_DATA_DROPLET>
POSTGRES_DB=libancom

# ========== Authentication ==========
BETTER_AUTH_SECRET=<GENERATE: openssl rand -base64 32>

# ========== URLs ==========
VITE_SITE_URL=https://libancom.co
SITE_URL=https://libancom.co
VITE_PROFILES_URL=https://libancom.co/v
PROFILES_URL=https://libancom.co/v

# ========== Langfuse ==========
LANGFUSE_PUBLIC_KEY=<GET_FROM_LANGFUSE_UI>
LANGFUSE_SECRET_KEY=<GET_FROM_LANGFUSE_UI>

# ========== LiteLLM ==========
LITELLM_MASTER_KEY=sk-<GENERATE: openssl rand -hex 16>
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# ========== Storage (Cloudflare R2) ==========
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<YOUR_R2_ACCESS_KEY>
S3_SECRET_ACCESS_KEY=<YOUR_R2_SECRET_KEY>
S3_REGION=auto
AVATARS_BUCKET_NAME=libancom
S3_PUBLIC_URL=https://pub-xxx.r2.dev

# ========== Email ==========
MAIL_FROM=noreply@libancom.co
RESEND_API_KEY=re_...

# ========== Payments (Stripe) ==========
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ========== Price IDs ==========
VITE_PRICE_ID_PRO_MONTHLY=price_...
VITE_PRICE_ID_PRO_YEARLY=price_...
VITE_PRICE_ID_LIFETIME=price_...
```

---

## Cloudflare DNS Setup

### Step 1: Add DNS Records

In Cloudflare Dashboard → DNS → Records:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | @ | `<APP_DROPLET_PUBLIC_IP>` | Proxied | Auto |
| A | www | `<APP_DROPLET_PUBLIC_IP>` | Proxied | Auto |
| A | langfuse | `<APP_DROPLET_PUBLIC_IP>` | Proxied | Auto |

### Step 2: Generate Origin Certificate

1. Go to **SSL/TLS** → **Origin Server**
2. Click **Create Certificate**
3. Configure:
   - Private key type: **RSA (2048)**
   - Hostnames: `libancom.co`, `*.libancom.co`
   - Certificate Validity: **15 years**
4. Click **Create**
5. Copy the **Origin Certificate** → Save as `config/nginx/certs/origin.pem`
6. Copy the **Private Key** → Save as `config/nginx/certs/origin.key`

### Step 3: Configure SSL/TLS Mode

1. Go to **SSL/TLS** → **Overview**
2. Set encryption mode to **Full (strict)**

### Step 4: Enable Additional Security (Optional)

- **SSL/TLS** → **Edge Certificates** → Enable **Always Use HTTPS**
- **SSL/TLS** → **Edge Certificates** → Set **Minimum TLS Version** to 1.2
- **Security** → **Settings** → Set **Security Level** to Medium
- **Speed** → **Optimization** → Enable **Auto Minify** (JavaScript, CSS, HTML)

---

## GitHub Container Registry Setup

### Step 1: Enable GitHub Container Registry

GitHub Container Registry (ghcr.io) is enabled by default for all GitHub accounts.

### Step 2: Configure Repository Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret Name | Description | Value |
|-------------|-------------|-------|
| `DEPLOY_SSH_KEY` | Private SSH key for deployment | Contents of `~/.ssh/libancom-deploy` |
| `APP_DROPLET_HOST` | App Droplet public IP | `xxx.xxx.xxx.xxx` |
| `DATA_DROPLET_HOST` | Data Droplet public IP | `xxx.xxx.xxx.xxx` |
| `DATA_DROPLET_PRIVATE_IP` | Data Droplet private IP | `10.116.0.3` |
| `DEPLOY_USER` | SSH username | `deploy` |

### Step 3: Configure Repository Variables

Go to **Settings** → **Secrets and variables** → **Actions** → **Variables** tab:

| Variable Name | Value |
|---------------|-------|
| `REGISTRY` | `ghcr.io` |

---

## GitHub Actions CI/CD Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'production'
        type: choice
        options:
          - production
          - staging

env:
  REGISTRY: ghcr.io
  WEB_IMAGE: ghcr.io/${{ github.repository_owner }}/libancom-web
  WORKER_IMAGE: ghcr.io/${{ github.repository_owner }}/libancom-worker

jobs:
  build:
    name: Build Docker Images
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: ${{ steps.meta.outputs.version }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata for Web image
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.WEB_IMAGE }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Web image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            VITE_SITE_URL=https://libancom.co
            VITE_PROFILES_URL=https://libancom.co/v
            SITE_URL=https://libancom.co
            PROFILES_URL=https://libancom.co/v

      - name: Build and push Worker image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile.worker
          push: true
          tags: |
            ${{ env.WORKER_IMAGE }}:${{ steps.meta.outputs.version }}
            ${{ env.WORKER_IMAGE }}:latest
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    name: Deploy to Production
    needs: build
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup SSH agent
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.DEPLOY_SSH_KEY }}

      - name: Add host keys to known_hosts
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -H ${{ secrets.APP_DROPLET_HOST }} >> ~/.ssh/known_hosts
          ssh-keyscan -H ${{ secrets.DATA_DROPLET_HOST }} >> ~/.ssh/known_hosts

      - name: Deploy to App Droplet
        env:
          IMAGE_TAG: ${{ needs.build.outputs.image_tag }}
          DATA_DROPLET_IP: ${{ secrets.DATA_DROPLET_PRIVATE_IP }}
        run: |
          ssh ${{ secrets.DEPLOY_USER }}@${{ secrets.APP_DROPLET_HOST }} << 'ENDSSH'
            cd ~/libancom

            # Pull latest images
            echo "Pulling latest images..."
            docker pull ghcr.io/${{ github.repository_owner }}/libancom-web:${{ env.IMAGE_TAG }}
            docker pull ghcr.io/${{ github.repository_owner }}/libancom-worker:${{ env.IMAGE_TAG }}

            # Update image tag in environment
            export IMAGE_TAG=${{ env.IMAGE_TAG }}
            export DATA_DROPLET_IP=${{ env.DATA_DROPLET_IP }}
            export GITHUB_REPOSITORY_OWNER=${{ github.repository_owner }}

            # Zero-downtime deployment for web service
            echo "Rolling out web service..."
            docker rollout -f docker-compose.app.yml web

            # Restart worker (not zero-downtime, but quick)
            echo "Restarting worker..."
            docker compose -f docker-compose.app.yml up -d worker

            # Clean up old images
            echo "Cleaning up old images..."
            docker image prune -af --filter "until=24h"

            echo "Deployment complete!"
          ENDSSH

      - name: Verify deployment
        run: |
          echo "Waiting for services to be healthy..."
          sleep 30

          # Check web health
          curl -f https://libancom.co/api/health || exit 1

          echo "Deployment verified successfully!"

      - name: Notify on failure
        if: failure()
        run: |
          echo "Deployment failed! Check the logs above for details."
          # Add Slack/Discord notification here if desired
```

### Database Migration Workflow

Create `.github/workflows/migrate.yml`:

```yaml
name: Database Migration

on:
  workflow_dispatch:
    inputs:
      confirm:
        description: 'Type "migrate" to confirm'
        required: true

jobs:
  migrate:
    name: Run Database Migrations
    runs-on: ubuntu-latest
    if: github.event.inputs.confirm == 'migrate'
    environment: production

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup SSH agent
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.DEPLOY_SSH_KEY }}

      - name: Add host keys
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -H ${{ secrets.APP_DROPLET_HOST }} >> ~/.ssh/known_hosts

      - name: Run migrations
        run: |
          ssh ${{ secrets.DEPLOY_USER }}@${{ secrets.APP_DROPLET_HOST }} << 'ENDSSH'
            cd ~/libancom

            # Run migrations using the web container
            docker compose -f docker-compose.app.yml run --rm web \
              pnpm --filter @repo/database migrate:deploy

            echo "Migrations complete!"
          ENDSSH
```

---

## Deployment Process

### Initial Deployment (First Time)

#### 1. Start Data Droplet Services

```bash
# SSH into Data Droplet
ssh deploy@<DATA_DROPLET_PUBLIC_IP>
cd ~/libancom

# Start all data services
docker compose -f docker-compose.data.yml up -d

# Verify services are healthy
docker compose -f docker-compose.data.yml ps

# Check logs if needed
docker compose -f docker-compose.data.yml logs -f
```

#### 2. Configure Langfuse

1. Access Langfuse at `https://langfuse.libancom.co` (or via IP temporarily)
2. Create an admin account
3. Create a new project
4. Go to **Settings** → **API Keys**
5. Create new API keys and save them to App Droplet's `.env.production`:
   - `LANGFUSE_PUBLIC_KEY`
   - `LANGFUSE_SECRET_KEY`

#### 3. Deploy App Droplet Services

```bash
# SSH into App Droplet
ssh deploy@<APP_DROPLET_PUBLIC_IP>
cd ~/libancom

# Log in to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u <your-github-username> --password-stdin

# Start all app services
docker compose -f docker-compose.app.yml up -d

# Run database migrations
docker compose -f docker-compose.app.yml run --rm web \
  pnpm --filter @repo/database migrate:deploy

# Verify services
docker compose -f docker-compose.app.yml ps
```

### Subsequent Deployments

After the initial setup, all deployments are handled automatically by GitHub Actions when you push to `main`:

1. **Push to main branch** → Triggers build workflow
2. **Build job** → Builds and pushes Docker images to ghcr.io
3. **Deploy job** → SSH into App Droplet, pulls images, runs `docker rollout`
4. **Zero-downtime** → New containers start, health checks pass, old containers stop

### Manual Deployment

If needed, you can trigger a manual deployment:

1. Go to **Actions** → **Build and Deploy**
2. Click **Run workflow**
3. Select branch and environment
4. Click **Run workflow**

---

## Monitoring & Maintenance

### Health Checks

```bash
# Check all services on App Droplet
ssh deploy@<APP_DROPLET_HOST> "docker compose -f ~/libancom/docker-compose.app.yml ps"

# Check all services on Data Droplet
ssh deploy@<DATA_DROPLET_HOST> "docker compose -f ~/libancom/docker-compose.data.yml ps"

# Check web app health
curl -f https://libancom.co/api/health

# Check Langfuse health
curl -f https://langfuse.libancom.co/api/public/health
```

### Viewing Logs

```bash
# Web app logs
ssh deploy@<APP_DROPLET_HOST> "docker compose -f ~/libancom/docker-compose.app.yml logs -f web"

# Worker logs
ssh deploy@<APP_DROPLET_HOST> "docker compose -f ~/libancom/docker-compose.app.yml logs -f worker"

# All app services
ssh deploy@<APP_DROPLET_HOST> "docker compose -f ~/libancom/docker-compose.app.yml logs -f"

# PostgreSQL logs
ssh deploy@<DATA_DROPLET_HOST> "docker compose -f ~/libancom/docker-compose.data.yml logs -f postgres"
```

### Backup Strategy

#### Database Backups (Automated)

Create a backup script on the **Data Droplet** at `~/libancom/scripts/backup.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p $BACKUP_DIR

# Backup PostgreSQL
echo "Backing up PostgreSQL..."
docker exec libancom-postgres pg_dumpall -U postgres | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"

# Backup Redis
echo "Backing up Redis..."
docker exec libancom-redis redis-cli BGSAVE
sleep 5
docker cp libancom-redis:/data/dump.rdb "$BACKUP_DIR/redis_$DATE.rdb"

# Clean old backups
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

Set up cron job:

```bash
chmod +x ~/libancom/scripts/backup.sh
crontab -e
# Add: 0 3 * * * /home/deploy/libancom/scripts/backup.sh >> /home/deploy/libancom/logs/backup.log 2>&1
```

#### DigitalOcean Snapshots

Enable weekly Droplet snapshots via DigitalOcean dashboard:
1. Go to **Droplets** → Select droplet → **Snapshots**
2. Enable **Weekly Snapshots**

### Updating Services

#### Update Data Services

```bash
ssh deploy@<DATA_DROPLET_HOST>
cd ~/libancom

# Pull latest images
docker compose -f docker-compose.data.yml pull

# Restart services one by one (to minimize downtime)
docker compose -f docker-compose.data.yml up -d --no-deps postgres
docker compose -f docker-compose.data.yml up -d --no-deps redis
docker compose -f docker-compose.data.yml up -d --no-deps clickhouse
docker compose -f docker-compose.data.yml up -d --no-deps minio
docker compose -f docker-compose.data.yml up -d --no-deps langfuse
docker compose -f docker-compose.data.yml up -d --no-deps langfuse-worker
```

#### Update LiteLLM

```bash
ssh deploy@<APP_DROPLET_HOST>
cd ~/libancom

# Pull latest LiteLLM
docker pull ghcr.io/berriai/litellm:main-latest

# Restart LiteLLM
docker compose -f docker-compose.app.yml up -d --no-deps litellm
```

---

## Troubleshooting

### Common Issues

#### 1. Services can't connect to Data Droplet

**Symptom**: Web app shows database connection errors

**Solution**:
```bash
# Verify Data Droplet services are running
ssh deploy@<DATA_DROPLET_HOST> "docker compose -f ~/libancom/docker-compose.data.yml ps"

# Check if ports are listening on private IP
ssh deploy@<DATA_DROPLET_HOST> "netstat -tlnp | grep -E '5432|6379'"

# Test connectivity from App Droplet
ssh deploy@<APP_DROPLET_HOST> "nc -zv <DATA_DROPLET_PRIVATE_IP> 5432"
```

#### 2. docker-rollout fails

**Symptom**: Zero-downtime deployment fails

**Solution**:
```bash
# Check if container_name is removed from web service (required for rollout)
# Check health check is properly configured

# Manual rollback
docker compose -f docker-compose.app.yml up -d --force-recreate web
```

#### 3. SSL Certificate Issues

**Symptom**: Browser shows certificate errors

**Solution**:
1. Verify Cloudflare SSL mode is "Full (strict)"
2. Check origin certificate hasn't expired
3. Verify certificate files exist: `ls -la ~/libancom/config/nginx/certs/`
4. Check Nginx logs: `docker logs libancom-nginx`

#### 4. Out of Memory

**Symptom**: Containers restart frequently, OOM errors in logs

**Solution**:
```bash
# Check memory usage
docker stats

# If needed, add memory limits to docker-compose
# Or upgrade to larger Droplet
```

#### 5. Disk Space Full

**Symptom**: Services fail to write data

**Solution**:
```bash
# Check disk usage
df -h
docker system df

# Clean up Docker
docker system prune -af --volumes

# Clean old logs
truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

### Useful Commands

```bash
# View real-time resource usage
docker stats

# View container logs with timestamps
docker logs -f --timestamps <container_name>

# Execute command in running container
docker exec -it libancom-postgres psql -U postgres

# Restart single service
docker compose -f docker-compose.app.yml restart web

# Force recreate service
docker compose -f docker-compose.app.yml up -d --force-recreate web

# View Docker networks
docker network ls
docker network inspect libancom-app

# Check container health
docker inspect --format='{{.State.Health.Status}}' libancom-web
```

---

## Security Checklist

- [ ] SSH password authentication disabled
- [ ] Root SSH login disabled
- [ ] fail2ban installed and configured
- [ ] Unattended security updates enabled
- [ ] DigitalOcean Cloud Firewall configured
- [ ] Data Droplet only accessible via VPC
- [ ] SSL/TLS enabled (Cloudflare Full Strict)
- [ ] Strong passwords generated for all services
- [ ] GitHub Secrets used for sensitive values
- [ ] Regular backups configured
- [ ] Monitoring alerts set up (optional)

---

## Quick Reference

### SSH Access

```bash
# App Droplet
ssh deploy@<APP_DROPLET_PUBLIC_IP>

# Data Droplet (via App Droplet as jump host if external access blocked)
ssh deploy@<DATA_DROPLET_PUBLIC_IP>
```

### Service URLs

| Service | URL |
|---------|-----|
| LibanCom App | https://libancom.co |
| Langfuse | https://langfuse.libancom.co |

### Important Paths

| Droplet | Path | Description |
|---------|------|-------------|
| App | `~/libancom/docker-compose.app.yml` | App services config |
| App | `~/libancom/.env.production` | Environment variables |
| App | `~/libancom/config/nginx/` | Nginx configuration |
| App | `~/libancom/config/litellm/` | LiteLLM configuration |
| Data | `~/libancom/docker-compose.data.yml` | Data services config |
| Data | `~/libancom/.env.production` | Environment variables |
| Data | `~/libancom/scripts/backup.sh` | Backup script |

### Docker Commands Cheatsheet

```bash
# Start all services
docker compose -f <file>.yml up -d

# Stop all services
docker compose -f <file>.yml down

# View logs
docker compose -f <file>.yml logs -f [service]

# Restart service
docker compose -f <file>.yml restart [service]

# Zero-downtime deploy (App Droplet only)
docker rollout -f docker-compose.app.yml web

# Pull latest images
docker compose -f <file>.yml pull

# Clean up
docker system prune -af
```
