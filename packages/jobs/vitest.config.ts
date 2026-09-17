import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["**/*.test.ts"],
		exclude: ["node_modules"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["**/*.test.ts", "**/index.ts", "**/types.ts"],
		},
	},
	resolve: {
		alias: {
			// Subpaths first: `@repo/database` is a prefix match and would
			// otherwise rewrite them to `index.ts/<subpath>`.
			"@repo/database/iradius": resolve(
				__dirname,
				"../database/lib/iradius.ts",
			),
			"@repo/database": resolve(__dirname, "../database/index.ts"),
			"@repo/config": resolve(__dirname, "../../config/index.ts"),
			"@repo/logs": resolve(__dirname, "../logs/index.ts"),
		},
	},
});
