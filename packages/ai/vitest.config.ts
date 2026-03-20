import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Load .env.local from monorepo root for LLM integration tests
function loadEnvLocal(): Record<string, string> {
	try {
		const content = readFileSync(
			resolve(__dirname, "../../.env.local"),
			"utf-8",
		);
		const env: Record<string, string> = {};
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) {
				continue;
			}
			const key = trimmed.slice(0, eqIdx);
			let value = trimmed.slice(eqIdx + 1);
			// Strip surrounding quotes
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			env[key] = value;
		}
		return env;
	} catch {
		return {};
	}
}

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["**/*.test.ts"],
		env: loadEnvLocal(),
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
