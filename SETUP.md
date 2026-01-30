# Setup Guide

This guide covers setting up the SaaS boilerplate for development and production deployment.

## Prerequisites

- Node.js 20 or higher
- pnpm 9.x
- PostgreSQL 16 (or use Docker)
- Redis (for rate limiting, optional in development)

## Quick Start (Development)

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd libancom
pnpm install
```

### 2. Start Development Services

Start PostgreSQL and Mailpit using Docker:

```bash
docker-compose up -d postgres mailpit
```

Or use your local PostgreSQL installation.

### 3. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/libancom"

# Auth
BETTER_AUTH_SECRET="your-secret-key-here"
BETTER_AUTH_URL="http://localhost:3000"

# Site URL
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# Email (for local development, use Mailpit)
RESEND_API_KEY=""
MAIL_FROM="noreply@localhost"
```

### 4. Initialize Database

Generate the Prisma client and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Development Services

### Mailpit (Email Testing)

Mailpit is included for local email testing:

- SMTP: `localhost:1025`
- Web UI: [http://localhost:8025](http://localhost:8025)

### Redis (Optional)

For rate limiting in development:

```bash
docker-compose up -d redis
```

Set `REDIS_URL=redis://localhost:6379` in your `.env` file.

## Production Deployment

### Docker Deployment

1. Create production environment file:

```bash
cp .env.example .env.prod
# Edit .env.prod with production values
```

2. Build and start services:

```bash
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

3. Run database migrations:

```bash
docker-compose -f docker-compose.prod.yml run --rm migrate
```

### Manual Deployment

1. Build the application:

```bash
pnpm build
```

2. Set production environment variables (see Environment Variables section)

3. Run database migrations:

```bash
pnpm db:migrate:deploy
```

4. Start the application:

```bash
pnpm start
```

## Environment Variables

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret key for auth (generate with `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Full URL of your application |
| `NEXT_PUBLIC_SITE_URL` | Public URL of your site |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string for rate limiting | - |
| `RESEND_API_KEY` | Resend API key for production emails | - |
| `MAIL_FROM` | Default sender email address | - |
| `STRIPE_SECRET_KEY` | Stripe secret key for payments | - |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | - |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | - |
| `OPENAI_API_KEY` | OpenAI API key for AI features | - |
| `S3_ACCESS_KEY` | S3-compatible storage access key | - |
| `S3_SECRET_KEY` | S3-compatible storage secret key | - |
| `S3_ENDPOINT` | S3-compatible storage endpoint | - |
| `S3_BUCKET` | S3 bucket name | - |
| `S3_REGION` | S3 region | - |

### OAuth Providers (Optional)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |

## Database Management

### Commands

```bash
# Generate Prisma client
pnpm db:generate

# Create and run migrations in development
pnpm db:migrate

# Apply migrations in production
pnpm db:migrate:deploy

# Open Prisma Studio (database GUI)
pnpm db:studio

# Push schema changes without migration (development only)
pnpm db:push

# Reset database (development only)
pnpm db:reset
```

## Features Overview

### Core Features

- **Authentication**: Email/password, magic links, OAuth (Google, GitHub), passkeys
- **Organizations**: Multi-tenant with member management and roles
- **Payments**: Stripe integration with subscriptions and usage-based billing
- **Internationalization**: Multi-language support with next-intl

### Enterprise Features

- **Audit Logging**: Track all user and system actions
- **Rate Limiting**: Protect APIs with configurable rate limits
- **Usage Quotas**: Enforce plan-based limits
- **API Keys**: Service-to-service authentication
- **Webhooks**: Outbound event notifications
- **Feature Flags**: Controlled feature rollouts
- **Per-Organization Theming**: Custom branding per organization
- **GDPR Compliance**: Data export and account deletion
- **Session Management**: View and revoke active sessions
- **In-App Notifications**: Real-time user notifications

## Troubleshooting

### Common Issues

**Database connection errors:**
- Ensure PostgreSQL is running
- Verify `DATABASE_URL` is correct
- Check that the database exists

**Prisma client errors:**
- Run `pnpm db:generate` to regenerate the client
- Clear node_modules and reinstall: `pnpm install --force`

**Build errors:**
- Clear Turbo cache: `pnpm clean`
- Verify all environment variables are set

**Docker build errors:**
- Ensure Docker has sufficient resources
- Check that all required build args are provided

### Getting Help

- Check existing issues in the repository
- Review the project documentation in `CLAUDE.md`
