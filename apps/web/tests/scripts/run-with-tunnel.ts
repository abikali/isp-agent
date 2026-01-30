#!/usr/bin/env npx tsx
/**
 * Run E2E tests with a Cloudflare tunnel for webhook testing
 *
 * This script:
 * 1. Starts a Cloudflare Quick Tunnel to expose localhost:3030
 * 2. Sets VITE_SITE_URL to the tunnel URL
 * 3. Runs Playwright tests
 * 4. Stops the tunnel after tests complete
 *
 * Usage:
 *   npx tsx tests/scripts/run-with-tunnel.ts [playwright-args...]
 *
 * Examples:
 *   npx tsx tests/scripts/run-with-tunnel.ts
 *   npx tsx tests/scripts/run-with-tunnel.ts --headed
 *   npx tsx tests/scripts/run-with-tunnel.ts tests/some-test.spec.ts
 */
import { spawn } from "node:child_process";
import { startTunnel } from "untun";

const PORT = 3030;

async function main() {
	// Get playwright args (everything after the script name)
	const playwrightArgs = process.argv.slice(2);

	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("\n🚇 Starting Cloudflare tunnel for webhook testing...\n");

	let tunnel: Awaited<ReturnType<typeof startTunnel>> | null = null;

	try {
		// Start the Cloudflare Quick Tunnel
		tunnel = await startTunnel({
			port: PORT,
			acceptCloudflareNotice: true,
		});

		const tunnelUrl = await tunnel.getURL();
		if (!tunnelUrl) {
			throw new Error("Failed to get tunnel URL");
		}

		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`✅ Tunnel established: ${tunnelUrl}`);
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`   Webhooks will be forwarded to localhost:${PORT}\n`);

		// Set environment variables for the web server
		const env = {
			...process.env,
			VITE_SITE_URL: tunnelUrl,
			BETTER_AUTH_URL: tunnelUrl,
			E2E_TUNNEL_URL: tunnelUrl,
		};

		// Run Playwright with the tunnel URL
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("🎭 Starting Playwright tests...\n");

		const playwrightProcess = spawn(
			"npx",
			["playwright", "test", ...playwrightArgs],
			{
				stdio: "inherit",
				env,
				cwd: process.cwd(),
			},
		);

		// Wait for Playwright to finish
		const exitCode = await new Promise<number>((resolve) => {
			playwrightProcess.on("close", (code) => {
				resolve(code ?? 1);
			});
		});

		// Close the tunnel
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("\n🔌 Stopping tunnel...");
		await tunnel.close();

		process.exit(exitCode);
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.error("❌ Failed to start tunnel:", error);

		if (tunnel) {
			await tunnel.close();
		}

		process.exit(1);
	}
}

main();
