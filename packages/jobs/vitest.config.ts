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
			"@repo/database": resolve(__dirname, "../database/index.ts"),
			"@repo/config": resolve(__dirname, "../../config/index.ts"),
			"@repo/logs": resolve(__dirname, "../logs/index.ts"),
		},
	},
});
