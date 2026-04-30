import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["**/*.test.ts"],
		exclude: [
			"node_modules",
			"**/*.integration.test.ts",
			"**/*.llm.test.ts",
			"**/*.smoke.test.ts",
		],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["modules/**/*.ts", "lib/**/*.ts"],
			exclude: ["**/*.test.ts", "**/index.ts", "**/types.ts"],
		},
	},
	resolve: {
		// Subpath aliases must come before the bare-specifier alias —
		// vitest matches alias prefixes in order, so `@repo/database` would
		// otherwise rewrite `@repo/database/billing` to `index.ts/billing`.
		alias: [
			{
				find: "@repo/database/enums",
				replacement: resolve(
					__dirname,
					"../database/prisma/generated/enums.ts",
				),
			},
			{
				find: "@repo/database/iradius",
				replacement: resolve(__dirname, "../database/lib/iradius.ts"),
			},
			{
				find: "@repo/database/billing",
				replacement: resolve(__dirname, "../database/lib/billing.ts"),
			},
			{
				find: "@repo/database/phones",
				replacement: resolve(__dirname, "../database/lib/phones.ts"),
			},
			{
				find: "@repo/database",
				replacement: resolve(__dirname, "../database/index.ts"),
			},
			{
				find: "@repo/config",
				replacement: resolve(__dirname, "../../config/index.ts"),
			},
			{
				find: "@repo/logs",
				replacement: resolve(__dirname, "../logs/index.ts"),
			},
			{
				find: "@repo/auth/permissions",
				replacement: resolve(__dirname, "../auth/permissions/index.ts"),
			},
			{
				find: "@repo/auth/lib/audit",
				replacement: resolve(__dirname, "../auth/lib/audit.ts"),
			},
			{
				find: "@repo/auth",
				replacement: resolve(__dirname, "../auth/index.ts"),
			},
			{
				find: "@repo/audit",
				replacement: resolve(__dirname, "../audit/index.ts"),
			},
			{
				find: "@repo/ai",
				replacement: resolve(__dirname, "../ai/index.ts"),
			},
			{
				find: "@repo/jobs",
				replacement: resolve(__dirname, "../jobs/index.ts"),
			},
			{
				find: "@repo/quotas",
				replacement: resolve(__dirname, "../quotas/index.ts"),
			},
			{
				find: "@repo/storage",
				replacement: resolve(__dirname, "../storage/index.ts"),
			},
		],
	},
});
