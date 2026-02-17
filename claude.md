# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Context

LibanCom is an ISP (Internet Service Provider) management platform. Key features:
- **Customer Management**: Track subscribers, service plans, connection types, account PINs
- **Employee Management**: Manage ISP staff and their roles
- **Stations**: Network infrastructure and station management
- **Tasks & Watchers**: Task assignment and automated monitoring/alerts
- **AI Agents**: Configurable AI chat agents with web chat channels
- **Teams/Organizations**: Multi-tenant organization management with role-based access
- **Integrations**: Third-party service connections via Nango

## Development Philosophy (CRITICAL - READ FIRST)

**TanStack's Core Promise**: An out-of-the-box framework. Custom code should be the exception, not the rule.

### Before Writing ANY Code:
1. Does TanStack Start/Query already handle this? (Check docs first)
2. Am I adding complexity to solve a problem that doesn't exist?
3. Could this work without my "improvement"?
4. Would deleting code fix this instead?

### Anti-Patterns to Avoid:
- Wrappers around primitives that work fine (don't wrap what works)
- "Utility" functions duplicating framework functionality
- Extra error handling for cases frameworks handle
- Abstraction layers that don't add clear value
- Custom config that could use convention defaults
- "Just in case" defensive code

### When Uncertain:
- Research TanStack source code and docs before implementing
- Use Context7 to fetch latest TanStack documentation
- Look at existing patterns in this codebase
- Ask: "Is this over-engineered?" (the answer is usually yes)
- Prefer deleting code over adding workarounds

## Development Commands

```bash
# Development
pnpm dev              # Start all services (web + background jobs)
pnpm worker           # Run background job workers only
pnpm build            # Build all packages and apps
pnpm start            # Start production server

# Code Quality
pnpm lint             # Run Biome linter
pnpm format           # Format code with Biome
pnpm type-check       # TypeScript type checking
pnpm check            # Run all Biome checks

# Database (from packages/database)
pnpm --filter @repo/database generate   # Generate Prisma client
pnpm --filter @repo/database migrate    # Create and apply migrations (use for schema changes)
pnpm --filter @repo/database studio     # Open Prisma Studio

# Database - Additional Commands
pnpm --filter @repo/database push       # Push schema directly (dev only, no migration history)
pnpm --filter @repo/database reset      # Reset database AND clear Redis sessions (use after migration reset)

# Testing (from apps/web)
pnpm --filter @repo/web test            # Run Vitest unit tests
pnpm --filter @repo/web test:ui         # Run Vitest with UI
pnpm --filter @repo/web test:coverage   # Run tests with coverage report
pnpm --filter @repo/web e2e             # Run Playwright E2E tests with UI
pnpm --filter @repo/web e2e:ci          # Run Playwright E2E tests in CI mode

# Run a single test file
pnpm --filter @repo/web test path/to/file.test.ts
```

**Note:** This project requires Node.js >= 24. Dev server runs on port **5050**.

## Storage (Cloudflare R2)

File storage uses Cloudflare R2 (S3-compatible). Images are uploaded via signed URLs and served through an image-proxy route.

### How It Works
1. **Upload**: Client requests signed upload URL via oRPC procedure
2. **Storage**: File uploaded directly to R2 via signed PUT URL
3. **Display**: Images served via `/image-proxy/{bucket}/{path}` route which creates signed GET URLs

### Key Files
- `packages/storage/provider/s3/index.ts` - S3 client and signed URL generation
- `apps/web/app/routes/image-proxy/$.tsx` - Image proxy route (signed URL redirect)
- `apps/web/modules/shared/lib/image-utils.ts` - Path to URL conversion helpers

## Architecture Overview

### Monorepo Structure

- **apps/web**: TanStack Start frontend (file-based routing with SSR)
- **apps/worker**: Background job workers (separate process from web, started via `pnpm worker`)
- **packages/**: Backend logic and shared utilities
  - `api`: oRPC procedures organized into modules (admin, users, organizations, customers, employees, etc.)
  - `ai`: AI model registry, providers, encryption, tools (using `@tanstack/ai`)
  - `auth`: Better Auth configuration with passkeys, magic links, 2FA, organization management
  - `database`: Prisma client, schema, and query helpers
  - `integrations`: Nango integration helpers
  - `jobs`: BullMQ background workers (email, webhook, AI chat, integration sync, watcher checks)
  - `mail`: Email providers and React Email templates
  - `payments`: Payment provider integrations (Stripe)
  - `storage`: S3-compatible file storage (Cloudflare R2)
  - `security`: Account lockout, device tracking, failed login handling
  - `utils`: Shared utility functions (prefer `es-toolkit` over lodash for new code)
  - `webhooks`, `notifications`, `audit`, `quotas`, `feature-flags`, `rate-limit`, `i18n`, `logs`
- **config/**: Central application configuration (plans, limits, features)
- **tooling/**: Shared TypeScript config, Tailwind config, and theme variables

### Frontend Organization (apps/web)

TanStack Start uses file-based routing in `app/routes/`:

- `app/routes/__root.tsx`: Root layout with providers
- `app/routes/_marketing/`: Public marketing pages (home, blog, docs, legal)
- `app/routes/_saas/`: Authenticated SaaS dashboard
  - `_saas/app/_account/`: User account pages (settings, admin)
  - `_saas/app/_org/$organizationSlug/`: Organization-scoped pages (customers, employees, tasks, watchers, ai-agents, etc.)
  - `_saas/app/_fullbleed/`: Full-bleed layout pages
- `app/routes/_auth/`: Authentication flows (login, signup, password reset)
- `app/routes/api/`: API routes (oRPC handler at `$.ts`, health check, webhooks)
- `app/routes/chat/`: AI chat routes

- `modules/`: Feature modules containing components, hooks, and lib code
  - `saas/customers/`: Customer management (CRUD, bulk import/export, PINs)
  - `saas/employees/`: Employee management
  - `saas/ai-agents/`: AI agent configuration and conversations
  - `saas/tasks/`: Task management
  - `saas/watchers/`: Automated monitoring and alerts
  - `saas/organizations/`: Organization settings, roles, API keys, webhooks
  - `saas/payments/`, `saas/settings/`, `saas/admin/`, `saas/onboarding/`, `saas/dashboard/`, `saas/start/`
  - `shared/`: Cross-cutting components and utilities
  - `ui/`: Shadcn UI components
  - `marketing/`: Marketing page components

**Path Aliases:** Use these import aliases in the web app:
- `@ui/*` → `modules/ui/*`
- `@shared/*` → `modules/shared/*`
- `@saas/*` → `modules/saas/*` (server-safe imports)
- `@saas/module/client` → `modules/saas/module/index.client.ts` (client-only imports)
- `@marketing/*` → `modules/marketing/*`
- `~/` → `app/`

### TanStack Start Patterns

**Navigation:**
```typescript
import { Link } from "@tanstack/react-router";
import { useRouter } from "@shared/hooks/router";

// Link component uses 'to' prop (not 'href')
<Link to="/dashboard" preload="intent">Dashboard</Link>

// Programmatic navigation
const router = useRouter();
router.navigate({ to: "/dashboard" });
```

### SSR Data Fetching with React Query

**IMPORTANT**: Use `ensureQueryData` + `useSuspenseQuery` + `AsyncBoundary` for SSR. Do NOT use `initialData` pattern - it doesn't properly populate the React Query cache.

**Global query defaults** (set in `__root.tsx`): `staleTime: 60s`, `retry: false`, `placeholderData: keepPreviousData`. Pending queries are dehydrated for streaming SSR.

**Route with SSR Data Prefetching:**
```typescript
import { orpc } from "@shared/lib/orpc";
import { getServerQueryClient } from "@shared/lib/server";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { dehydrate } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

// Server function to prefetch data into React Query cache
const getDataFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const queryClient = getServerQueryClient();

    // Populate cache with ensureQueryData
    await queryClient.ensureQueryData(
      orpc.items.list.queryOptions({ input: { id: data.id } })
    );

    return {
      dehydratedState: JSON.parse(JSON.stringify(dehydrate(queryClient))),
      id: data.id,
    };
  });

export const Route = createFileRoute("/path/$param")({
  loader: ({ params }) => getDataFn({ data: { id: params.id } }),
  component: PageComponent,
});

function PageComponent() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData();

  return (
    <AsyncBoundary
      fallback={<Skeleton />}
      dehydratedState={loaderData.dehydratedState}
    >
      <DataList id={id} />
    </AsyncBoundary>
  );
}
```

### AsyncBoundary (Required Pattern)

**Always use `AsyncBoundary` for components using `useSuspenseQuery`**. It combines ErrorBoundary + Suspense + HydrationBoundary in the correct nesting order.

```typescript
import { AsyncBoundary } from "@shared/components/AsyncBoundary";

// Basic usage
<AsyncBoundary fallback={<CustomersListSkeleton />}>
  <CustomersList />
</AsyncBoundary>

// With SSR hydration (recommended)
<AsyncBoundary
  fallback={<AnalyticsSkeleton />}
  dehydratedState={loaderData.dehydratedState}
>
  <AnalyticsContent />
</AsyncBoundary>

// With error variant
<AsyncBoundary
  fallback={<Skeleton />}
  errorFallback="inline"  // "default" | "inline" | "fullPage"
  onError={(error) => logError(error)}
>
  <DataComponent />
</AsyncBoundary>

// NEVER use bare Suspense for data fetching
<Suspense fallback={<Skeleton />}>  // Wrong - no error handling
  <DataComponent />
</Suspense>
```

**Props:**
- `fallback` (required): Loading skeleton component
- `dehydratedState`: SSR hydration state from loader
- `errorFallback`: `"default"` | `"inline"` | `"fullPage"` | custom ReactNode
- `onError`: Error callback for logging/reporting
- `resetKeys`: Array of values that trigger error reset when changed

**Component with useSuspenseQuery (for list pages):**
```typescript
"use client";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";

// MUST be used within a Suspense boundary
export function useItems(id: string) {
  const query = useSuspenseQuery(
    orpc.items.list.queryOptions({ input: { id } })
  );
  return { items: query.data?.items ?? [], refetch: query.refetch };
}
```

**Component with useQuery (for dropdowns/filters):**
```typescript
"use client";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";

// For non-Suspense contexts (dropdowns, filters, dialogs)
export function useItemsQuery() {
  const organizationId = useOrganizationId();

  const query = useQuery(
    organizationId
      ? orpc.items.list.queryOptions({ input: { organizationId } })
      : disabledQuery(["items", "list"])
  );

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
```

**Mutation with cache invalidation:**
```typescript
"use client";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.customers.create.mutationOptions(),
    onSuccess: () => {
      // Use .key() for partial matching invalidation (NOT .queryKey() which requires input args)
      queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
    },
  });
}
```

**Key helpers:**
- `getServerQueryClient()` - Creates per-request QueryClient for SSR (uses React `cache()`)
- `disabledQuery(queryKey)` - Disabled query config when organizationId is null
- `disabledInfiniteQuery(queryKey, emptyData)` - Same for infinite queries
- `useOrganizationId()` - Gets active organization ID from context
- `assertOrganizationId(id)` - Throws if null (use inside `queryFn` when `enabled` guards)
- `hasOrganizationId(id)` - Type guard narrowing to `string`

### API Layer (oRPC)

**Client Usage:**
```typescript
import { orpc, orpcClient } from "@shared/lib/orpc";

// For React Query hooks - use orpc (TanStack Query utilities)
const query = useQuery(orpc.customers.list.queryOptions({ input: { organizationId } }));
const mutation = useMutation(orpc.customers.create.mutationOptions());

// For direct calls (in server functions, mutations) - use orpcClient
const result = await orpcClient.customers.create({ organizationId, fullName: "..." });
```

**API Structure:**
- Procedures in `packages/api/modules/*/procedures/*.ts`
- Module routers in `packages/api/modules/*/router.ts`
- Main router at `packages/api/orpc/router.ts`
- Base procedures in `packages/api/orpc/procedures.ts`: `publicProcedure`, `protectedProcedure`, `adminProcedure`, `authProcedure`, `rateLimitedProcedure`
- Use package exports (`@repo/api`) not deep imports

**Available Router Modules:**
`admin`, `aiAgents`, `auth`, `customers`, `employees`, `newsletter`, `integrations`, `organizations`, `users`, `payments`, `audit`, `apiKeys`, `webhooks`, `featureFlags`, `notifications`, `sessions`, `security`, `servicePlans`, `stations`, `tasks`, `watchers`

## Core Conventions

**Important**: All code changes must pass `pnpm lint` and `pnpm type-check` before being committed. Do not introduce linting errors or type errors.

### TypeScript & Code Style
- TypeScript everywhere; prefer `interface` over `type` for object shapes
- Named function exports; no default exports or classes
- Use `function` keyword for pure functions
- Avoid enums; use maps/records or union literals
- Directories: kebab-case; Components: PascalCase; Variables: camelCase
- `noExplicitAny` is an **error** (use `unknown` + type narrowing instead)
- `noConsole` is a **warn** (use `@repo/logs` for production logging)
- `exactOptionalPropertyTypes` is enabled in backend packages but **disabled** in `apps/web`
- `noUncheckedIndexedAccess` is enabled (indexed access returns `T | undefined`)
- Prisma has `strictUndefinedChecks` preview feature enabled — explicitly pass `null` not `undefined` for nullable fields

### React & TanStack Start
- Add `"use client"` only when necessary for client-side interactivity
- Use `notFound()`, `redirect()` from `@tanstack/react-router` for navigation control
- See "SSR Data Fetching with React Query" section above for data fetching patterns
- Wrap client components in Suspense with fallback
- Use dynamic loading for non-critical components
- Structure component files: exported component, subcomponents, helpers, static content, types

### Server/Client Component Boundaries

**Barrel Export Pattern:**
Each `modules/saas/` module has split barrel exports:
- `index.ts` - Server-safe exports only (types, constants, server utilities)
- `index.client.ts` - Client-only exports (hooks, context, interactive components)

**Import Conventions:**
```typescript
// Server-safe imports - use base path
import { SomeType } from "@saas/auth";
import { OtherType } from "@saas/organizations";

// Client-only imports - use /client path
import { useSession, LoginForm } from "@saas/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
```

**Rules:**
- ALL hook files MUST have `"use client"` at the top
- ALL files using `createContext` MUST have `"use client"`
- ALL files using React Query hooks (`useQuery`, `useMutation`) MUST have `"use client"`

### Styling
- Shadcn UI + Radix primitives + Tailwind CSS
- Use the `cn` helper for conditional class names
- Mobile-first responsive design
- Theme tokens in `tooling/tailwind/theme.css`
- Theme state managed via `@shared/stores/theme-store` (not next-themes)
- Optimize images: use WebP format, include size data, implement lazy loading

### Forms & State
- TanStack Form (`@tanstack/react-form`) for forms
- Use `useStore(form.store, selector)` to subscribe to form state efficiently
- Colocate state in components or dedicated hooks in `modules/shared`

**Form Validation Pattern:**
Use zod schemas from `@repo/api/lib/validation` for field validation. These schemas work with TanStack Form's Standard Schema support.

```typescript
import { emailSchema, passwordSchema } from "@repo/api/lib/validation";
import { useForm, useStore } from "@tanstack/react-form";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";

// Use zod schema directly as validator
<form.Field
  name="email"
  validators={{
    onBlur: emailSchema,  // or onChange for immediate validation
  }}
>
  {(field) => {
    const hasErrors =
      field.state.meta.isTouched &&
      field.state.meta.errors.length > 0;
    return (
      <Field data-invalid={hasErrors || undefined}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
          aria-invalid={hasErrors || undefined}
        />
        {hasErrors && <FieldError errors={field.state.meta.errors} />}
      </Field>
    );
  }}
</form.Field>
```

**Available validation schemas** (`@repo/api/lib/validation`):
- `nameSchema` - Name field (1-100 chars)
- `emailSchema` - Email validation
- `passwordSchema` - Password (min 8 chars)
- `passwordLoginSchema` - Login password (just required)
- `organizationNameSchema` - Org name (3-32 chars)
- `urlSchema` - URL validation
- `messageSchema` - Required message field

**Cross-field validation** (e.g., confirmPassword): Use inline validators that return strings:
```typescript
validators={{
  onBlur: ({ value, fieldApi }) => {
    if (value !== fieldApi.form.getFieldValue("password")) {
      return "Passwords do not match";
    }
    return undefined;
  },
}}
```

The `FieldError` component handles both zod schema errors (Standard Schema format) and inline string errors.

### Data Layer
- API logic goes in `@repo/api` modules
- Use generated clients from `@repo/database`; never instantiate Prisma directly
- Auth helpers from `@repo/auth` for sessions, passkeys, organizations
- **Prisma models**: Use PascalCase in schema with `@@map("table_name")` for DB mapping. Access via camelCase: `db.apiKey`, `db.profileLead`, `db.webhookDelivery`

### Database Schema Changes

**Always use migrations for schema changes:**
```bash
# 1. Edit packages/database/prisma/schema.prisma
# 2. Create and apply migration
pnpm --filter @repo/database migrate --name descriptive_name
# 3. Regenerate Prisma client (automatic with migrate, but can run manually)
pnpm --filter @repo/database generate
```

**Important:** Never use `db push` for schema changes in development - it bypasses migration history and causes drift issues. Only use `migrate` to ensure the `_prisma_migrations` table stays in sync.

## Key Files

**Configuration:**
- `config/index.ts`: Central config (auth, payments, organizations, security, jobs)
- `apps/web/vite.config.ts`: TanStack Start/Vite configuration (Nitro with `node-cluster` preset for production)
- `apps/web/app/router.tsx`: Router configuration
- `apps/web/playwright.config.ts`: E2E test configuration
- `biome.json`: Linter/formatter configuration

**API & Database:**
- `packages/api/orpc/router.ts`: Main API router
- `packages/api/orpc/procedures.ts`: Base procedures (public, protected, admin, rate-limited)
- `packages/api/orpc/middleware/`: Rate limiting, quota enforcement, locale middleware
- `packages/database/prisma/schema.prisma`: Database schema (PostgreSQL, Prisma client engine)

**SSR & Data Fetching:**
- `apps/web/modules/shared/lib/orpc.ts`: Isomorphic oRPC client (`orpc`, `orpcClient`)
- `apps/web/modules/shared/lib/server.ts`: Server utilities (`getServerQueryClient`)
- `apps/web/modules/shared/lib/organization.ts`: Org helpers (`useOrganizationId`, `disabledQuery`)
- `apps/web/app/routes/__root.tsx`: Root layout with QueryClient provider

**Reference Implementation:**
- `apps/web/app/routes/_saas/app/_org/$organizationSlug/customers/index.tsx`: Route with AsyncBoundary
- `apps/web/modules/saas/customers/hooks/use-customers.ts`: Full CRUD hooks (`useSuspenseQuery`, `useQuery`, mutations with cache invalidation)

**Auth:**
- `packages/auth/auth.ts`: Better Auth config (passkeys, magic links, 2FA, social login via Google/GitHub, organization plugin with dynamic access control)
- `packages/auth/client.ts`: Auth client for frontend use (`@repo/auth/client`)
- Sessions stored in Redis (not database)

**Error Handling:**
- `apps/web/modules/shared/components/AsyncBoundary.tsx`: Unified async boundary (ErrorBoundary + Suspense + HydrationBoundary)
- `apps/web/modules/shared/components/ErrorBoundary.tsx`: Base error boundary with fallback variants

**Monitoring:**
- Sentry via `@sentry/tanstackstart-react` (enabled in production when `SENTRY_DSN` is set)

## E2E Testing (Playwright)

E2E tests are located in `apps/web/tests/`. Run with `pnpm --filter @repo/web e2e:ci`.

### Critical: TanStack Devtools Interference

In development mode, TanStack Router and Query devtools add elements to the DOM that match generic text selectors. This causes strict mode violations.

**Always use role-based selectors instead of text locators:**
```typescript
// BAD - matches devtools route labels containing "General"
page.locator("text=General");
page.getByText("General");

// GOOD - specifically targets link elements
page.getByRole("link", { name: "General" });
page.getByRole("button", { name: "Save" });
page.getByRole("heading", { name: "Settings" });
```

### Selector Best Practices

**Use specific role selectors:**
```typescript
// For navigation links
page.getByRole("link", { name: "Organization Settings" });

// For buttons
page.getByRole("button", { name: /save/i });

// For headings (with level if needed)
page.getByRole("heading", { name: "Account Settings" });
page.getByRole("heading", { name: "Profiles", level: 1 });

// For form inputs - use exact name to avoid matching similar labels
page.getByRole("textbox", { name: /^Name/i });      // Matches "Name *" but not "Username *"
page.getByRole("textbox", { name: /^Username/i }); // Matches "Username *" but not "Name *"

// For tabs
page.getByRole("tab", { name: "Pending Invitations" });
```

**Handle multiple matching elements:**
```typescript
// When multiple elements match, use first() or scope to a container
page.getByRole("main").first();
page.locator("main").getByRole("textbox").first();

// Scope to specific container to avoid matching devtools
const dialog = page.locator('[role="dialog"]');
dialog.getByRole("button", { name: /confirm/i });
```

**For lists and list items:**
```typescript
// Use getByRole for semantic lists, not CSS selectors
const linksList = page.getByRole("list", { name: "Profile links" });
const linkItem = linksList.getByRole("listitem").filter({ hasText: "example.com" });
```

### Graceful Fallbacks

For features that may not be implemented or visible:
```typescript
// Check visibility with catch to avoid test failures
const hasFeature = await button.isVisible().catch(() => false);

if (hasFeature) {
  await button.click();
} else {
  // Verify page loaded correctly as fallback
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}
```

### Test Organization

- Tests are in `apps/web/tests/` organized by feature
- Each test file has a `beforeAll` hook that checks if test user exists
- Helper functions handle login and navigation
- Use `page.waitForLoadState("networkidle")` after navigation
- Use reasonable timeouts: `{ timeout: 10000 }` for visibility checks
