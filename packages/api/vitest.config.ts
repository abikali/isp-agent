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
		alias: {
			"@repo/database": resolve(__dirname, "../database/index.ts"),
			"@repo/config": resolve(__dirname, "../../config/index.ts"),
			"@repo/logs": resolve(__dirname, "../logs/index.ts"),
			"@repo/auth/permissions": resolve(
				__dirname,
				"../auth/permissions/index.ts",
			),
			"@repo/auth/lib/audit": resolve(__dirname, "../auth/lib/audit.ts"),
			"@repo/auth": resolve(__dirname, "../auth/index.ts"),
			"@repo/audit": resolve(__dirname, "../audit/index.ts"),
		},
	},
});
