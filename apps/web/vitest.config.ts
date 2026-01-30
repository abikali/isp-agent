import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		include: ["**/*.test.{ts,tsx}"],
		exclude: ["node_modules", "tests"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["modules/**/*.{ts,tsx}"],
			exclude: ["**/*.test.{ts,tsx}", "**/index.ts"],
		},
		deps: {
			optimizer: {
				web: {
					// Inline these modules so vitest can properly mock them
					include: [
						"@saas/organizations/client",
						"@shared/lib/organization",
					],
				},
			},
		},
	},
	resolve: {
		alias: {
			"@ui": resolve(__dirname, "./modules/ui"),
			"@shared": resolve(__dirname, "./modules/shared"),
			// Handle /client suffix for barrel exports (index.client.ts files)
			"@saas/organizations/client": resolve(
				__dirname,
				"./modules/saas/organizations/index.client.ts",
			),
			"@saas/auth/client": resolve(
				__dirname,
				"./modules/saas/auth/index.client.ts",
			),
			"@saas": resolve(__dirname, "./modules/saas"),
			"@marketing": resolve(__dirname, "./modules/marketing"),
		},
	},
});
