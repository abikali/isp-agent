.PHONY: help up down logs ps dev build start worker lint format type-check check db-generate db-push db-migrate db-studio test test-ui e2e e2e-ci clean install setup tunnel dev-tunnel whapi-webhook

# Default target
help:
	@echo "LibanCom Development Commands"
	@echo ""
	@echo "Docker:"
	@echo "  make up          - Start Docker services (postgres, redis, mailpit)"
	@echo "  make down        - Stop Docker services"
	@echo "  make logs        - View Docker logs"
	@echo "  make ps          - Show running containers"
	@echo ""
	@echo "Development:"
	@echo "  make dev         - Start development server"
	@echo "  make dev-tunnel  - Start dev server with Cloudflare tunnel (for webhooks)"
	@echo "  make tunnel      - Start Cloudflare tunnel only (localhost:3030)"
	@echo "  make build       - Build all packages"
	@echo "  make start       - Start production server"
	@echo "  make worker      - Run background job workers"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint        - Run Biome linter"
	@echo "  make format      - Format code with Biome"
	@echo "  make type-check  - TypeScript type checking"
	@echo "  make check       - Run all Biome checks"
	@echo ""
	@echo "Database:"
	@echo "  make db-generate - Generate Prisma client"
	@echo "  make db-push     - Push schema to database"
	@echo "  make db-migrate  - Run migrations"
	@echo "  make db-studio   - Open Prisma Studio"
	@echo ""
	@echo "Testing:"
	@echo "  make test        - Run Vitest unit tests"
	@echo "  make test-ui     - Run Vitest with UI"
	@echo "  make e2e         - Run Playwright E2E tests"
	@echo "  make e2e-ci      - Run Playwright E2E in CI mode"
	@echo ""
	@echo "Utility:"
	@echo "  make clean       - Clean build artifacts"
	@echo "  make install     - Install dependencies"
	@echo "  make setup       - Full setup (Docker + install + db)"
	@echo ""
	@echo "Whapi (WhatsApp):"
	@echo "  make whapi-webhook WHAPI_TOKEN=xxx WEBHOOK_URL=https://... - Set Whapi webhook URL"

# Docker
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

# Development
dev:
	pnpm dev

build:
	pnpm build

start: up
	pnpm start

worker:
	pnpm worker

# Tunnels (for webhook development)
tunnel:
	@echo "Starting Cloudflare tunnel to localhost:3030..."
	npx untun tunnel http://localhost:3030

dev-tunnel:
	pnpm exec dotenv -c -- pnpm --filter @repo/web exec tsx tests/scripts/start-dev-with-tunnel.ts

# Code Quality
lint:
	pnpm lint

format:
	pnpm format

type-check:
	pnpm type-check

check:
	pnpm lint && pnpm type-check && pnpm build

# Database
db-generate:
	pnpm --filter @repo/database generate

db-push:
	pnpm --filter @repo/database push

db-migrate:
	pnpm --filter @repo/database migrate

db-studio:
	pnpm --filter @repo/database studio

# Testing
test:
	pnpm --filter @repo/web test

test-ui:
	pnpm --filter @repo/web test:ui

e2e:
	pnpm --filter @repo/web e2e

e2e-ci:
	pnpm --filter @repo/web e2e:ci

# Utility
clean:
	pnpm clean

install:
	pnpm install

setup: up install db-generate db-push
	@echo "Setup complete! Run 'make dev' to start development."

# Whapi (WhatsApp)
whapi-webhook:
	@if [ -z "$(WHAPI_TOKEN)" ]; then echo "Error: WHAPI_TOKEN is required"; exit 1; fi
	@if [ -z "$(WEBHOOK_URL)" ]; then echo "Error: WEBHOOK_URL is required"; exit 1; fi
	@echo "Setting Whapi webhook to $(WEBHOOK_URL)..."
	@curl -s -X PATCH https://gate.whapi.cloud/settings \
		-H "Authorization: Bearer $(WHAPI_TOKEN)" \
		-H "Content-Type: application/json" \
		-d '{"webhooks":[{"mode":"body","url":"$(WEBHOOK_URL)","events":[{"type":"messages","method":"post"}]}]}' | jq .
