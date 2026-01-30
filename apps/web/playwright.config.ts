import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

// Auth state file for session reuse across tests
const AUTH_FILE = path.join(__dirname, "tests/.auth/user.json");

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * For CI, you can use sharding to split tests across multiple jobs:
 *   pnpm exec playwright test --shard=1/3
 *   pnpm exec playwright test --shard=2/3
 *   pnpm exec playwright test --shard=3/3
 */
const isCI = !!process.env["CI"];

export default defineConfig({
	globalSetup: "./tests/global-setup.ts",
	globalTeardown: "./tests/global-teardown.ts",
	testDir: "./tests",
	// Use sequential execution with single worker to prevent resource exhaustion
	fullyParallel: false,
	forbidOnly: isCI,
	// Reduce retries to prevent cascading failures under load
	retries: isCI ? 1 : 0,
	workers: 1,
	reporter: [["html"]],
	timeout: 60_000, // 60s per test
	use: {
		baseURL: "http://localhost:3030",
		trace: "on-first-retry",
		video: {
			mode: "retain-on-failure",
			size: { width: 640, height: 480 },
		},
	},
	projects: [
		// Auth setup runs first to create session state
		{
			name: "setup",
			testMatch: /.*\.setup\.ts/,
		},
		// Unauthenticated tests (login, signup, public pages, marketing)
		{
			name: "unauthenticated",
			dependencies: ["setup"],
			testMatch: /tests\/(auth|marketing)\/.*\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				channel: "chromium",
				// No storage state - tests run without auth
			},
		},
		// Authenticated tests with session state reuse
		{
			name: "authenticated",
			dependencies: ["setup"],
			testIgnore: /tests\/(auth|marketing)\/.*\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				channel: "chromium",
				// Reuse auth state from setup to avoid repeated logins
				storageState: AUTH_FILE,
				// Enable geolocation for analytics tests
				geolocation: { latitude: 40.7128, longitude: -74.006 },
				permissions: ["geolocation"],
			},
		},
	],
	webServer: [
		{
			command: "pnpm --filter web exec vite dev --port 3030",
			// Use health endpoint for faster startup detection
			url: "http://localhost:3030/api/health",
			reuseExistingServer: !isCI,
			stdout: "pipe",
			timeout: 120 * 1000,
			// Pass tunnel URL to webServer when running with tunnel
			env: {
				...process.env,
				// These will be set by run-with-tunnel.ts script
				...(process.env["E2E_TUNNEL_URL"]
					? {
							VITE_SITE_URL: process.env["E2E_TUNNEL_URL"],
							BETTER_AUTH_URL: process.env["E2E_TUNNEL_URL"],
						}
					: {}),
			},
		},
		{
			// Worker process for background jobs
			command: "pnpm --filter @repo/jobs worker",
			// No URL to check - worker doesn't have HTTP endpoint
			// Use port 0 to skip port checking
			port: 0,
			reuseExistingServer: !isCI,
			stdout: "pipe",
			timeout: 30 * 1000,
		},
	],
});
