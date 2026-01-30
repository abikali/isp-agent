# Changelog

# 2025-11-25 v1.1.4

### Fix OpenAPI schema

Fixed was an issue that would cause custom OpenAPI endpoints to not be reachable throught the `/api` path.

---

# 2025-11-23 v1.1.3

### Fix active sessions block

Fixed an issue where the removing the current session from the active sessions block was causing a redirect loop on the login page.

---

## 2025-11-20 v1.1.2

### Fix missing organization settings item in navbar

When in the config file the `hideOrganization` option is set to true, the organization settings item was missing in the navbar.

---

## 2025-11-16 v1.1.1

### Remove unnecessary font-sans variable

Removed the unnecessary `--font-sans` variable from the theme.css file as it is already defined the the `layout.tsx` file where the font is imported and injected to the html element.

### Updated dependencies

All production and development dependencies have been updated to the latest versions.

---

## 2025-11-12 v1.1.0

### Add claude.md file

For a better coding experience with Claude Code, we have added a `claude.md` file to the root of the repository.
This file contains the coding guidelines for the project, and is used by Claude Code to generate code.

---

## 2025-11-12 v1.0.9

### Fix passkeys reload issue

Fixed an issue where the passkeys list was not being reloaded correctly after adding or deleting a passkey.

---

## 2025-11-12 v1.0.8

### Fix missing fields in auth schema

Added missing fields (`aaguid` for Passkey and `displayUsername` for User) in the schema.
This was causing the passkeys creation to fail.

---

## 2025-11-12 v1.0.7

### Fixed mobile menu closing issue

Fixed an issue where the mobile menu was not closing when clicking on a menu item.

---

## 2025-11-11 v1.0.6

### Fix content-collections schema

The content-collections schema will soon require the `content` field to be present in the schema, which previously was automatically generated. 
We have added it to the schema to avoid breaking changes with the upcoming content-collections version.

### Updated production dependencies

All production dependencies have been updated to the latest versions.

### Fixed AI chat component

Fixed a validation issue in the AI chat component that was causing the `addMessageToChat` procedure to fail.

---

## 2025-11-11 v1.0.5

### Fix formatting

Ran `pnpm format` to fix formatting issues in the codebase.

### Updated all dependencies

Production and development dependencies have been updated to the latest versions.

---

## 2025-11-08 v1.0.4

### Fixed AI chat component

Fixed a type issue in the AI chat component.

### Fixed Tailwind CSS wrapper component in mail templates

As reported in #2173, some Tailwind CSS classes were not being applied correctly in the email wrapper.

### Added typescript as dev dependency to web app

Added typescript as dev dependency to fix the `pnpm type-check` command.

---

## 2025-11-08 v1.0.3

### Fixed schema error in addMessageToChat procedure

Fixed a schema error in the `addMessageToChat` procedure that was causing the OpenAPI schema to be invalid.

---

## 2025-11-03 v1.0.2

### Updated dependencies

---

## 2025-11-03 v1.0.1

### Updated React type definitions

Updated `@types/react` and `@types/react-dom` from version 19.0.0 to 19.2.2 to include the latest type definitions and bug fixes for React 19.

The pnpm overrides have been consolidated to the root `package.json` for better consistency across the monorepo.

### Optimized pnpm dependency installation

Added `onlyBuiltDependencies` configuration to pnpm settings to optimize installation time by only building Prisma-related packages (`@prisma/client`, `prisma`, and `prisma-zod-generator`) when needed. This reduces unnecessary rebuilds and speeds up dependency installation in the monorepo.

### Added pg dependency

Added `pg` (PostgreSQL client) as a dependency to support the Prisma Rust-free client migration. The `pg` package is required by the Prisma database adapter for PostgreSQL connections.

---

## 2025-11-03 v1.0.0

### Prisma client migration to Rust-free client

In order to reduce the bundle size of the client and improve performance, we have migrated to the Rust-free Prisma client.

#### Migration steps

If you are upgrading your supastarter project to this version, you need to update the way your prisma client is generated:

1. Update `prisma` and `@prisma/client` to the latest version.

2. In the `schema.prisma` file, change the `provider` to `prisma-client`, the `output` to `./generated` and set the `engineType` to `client`.

3. Update the `packages/database/prisma/client.ts` like this:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

const prismaClientSingleton = () => {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is not set");
	}

	const adapter = new PrismaPg({
		connectionString: process.env.DATABASE_URL,
	});

	return new PrismaClient({ adapter });
};

declare global {
	var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// biome-ignore lint/suspicious/noRedeclare: This is a singleton
const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
	globalThis.prisma = prisma;
}

export { prisma as db };
```

In case are using a different database than PostgreSQL, see the following documentation on which adapter to use: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/no-rust-engine#3-install-the-driver-adapter

### Next.js 16 migration

If you are updating an existing project, work through the following steps to align with the new Next.js 16 defaults and Supastarter conventions:

1. Upgrade  `next`, `react`, and `react-dom` to their latest stable releases in both `package.json` files (`package.json` at the root and `apps/web/package.json` if it exists).

2. Rename the middleware entry point:
   - Move `apps/web/middleware.ts` to `apps/web/proxy.ts`.
   - Inside the renamed file update the exported handler to `export function proxy(...)` (it was previously `middleware`).

3. Remove the inline ESLint configuration from `apps/web/next.config.ts`

4. Update the marketing docs layout `apps/web/app/(marketing)/[locale]/docs/[[...path]]/layout.tsx`, by changing the `DocsLayout` prop from `disableThemeSwitch` to `themeSwitch={{ enabled: true }}`.

See https://nextjs.org/docs/app/guides/upgrading/version-16 for full migration guide (beyond the supastarter codebase).

---

### Biome 2.3 upgrade

We have upgraded to Biome 2.3 which introduces some changes to how CSS files are handled and it currently doesn't support the format in which Tailwind CSS 4 is configured, so you need to update the `biome.json` file to ignore the `globals.css` file for now:

```jsonc
{
    "files": {
        "includes": [
            "**",
            "!zod/index.ts",
            "!tailwind-animate.css",
            "!!**/globals.css" // <- ignore this file
        ]
    },
    "css": {
        "parser": {
            "tailwindDirectives": true // <- enable tailwind directives parsing
        }
    }
}
```
