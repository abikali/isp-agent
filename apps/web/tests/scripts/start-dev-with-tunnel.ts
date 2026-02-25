#!/usr/bin/env npx tsx
/**
 * Start development server with a Cloudflare tunnel for webhook testing
 *
 * This script:
 * 1. Starts a Cloudflare Quick Tunnel to expose localhost:3030
 * 2. Sets VITE_SITE_URL and BETTER_AUTH_URL to the tunnel URL
 * 3. Starts the development server with the updated env vars
 *
 * Usage:
 *   npx tsx tests/scripts/start-dev-with-tunnel.ts
 *
 * The tunnel URL will be printed to the console and can be used for:
 * - Firecrawl webhooks during development
 * - External service callbacks
 * - Mobile device testing
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTunnel } from "untun";
import { decryptToken, whatsapp } from "../../../../packages/ai/index.js";
import { db } from "../../../../packages/database/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5050;

async function refreshWhatsAppWebhooks(tunnelUrl: string) {
	try {
		const channels = await db.aiAgentChannel.findMany({
			where: { provider: "whatsapp", enabled: true },
			select: {
				id: true,
				name: true,
				webhookToken: true,
				encryptedApiToken: true,
			},
		});

		if (channels.length === 0) {
			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log("📱 No WhatsApp channels to update\n");
			return;
		}

		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(
			`📱 Updating ${channels.length} WhatsApp channel webhook(s)...`,
		);

		for (const channel of channels) {
			const webhookUrl = `${tunnelUrl}/api/webhooks/chat/whatsapp/${channel.webhookToken}`;
			const apiToken = decryptToken(channel.encryptedApiToken);
			const success = await whatsapp.setWebhook(apiToken, webhookUrl);
			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log(
				`   ${success ? "✅" : "❌"} ${channel.name} (${channel.id})`,
			);
		}
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("");
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.error("⚠️  Failed to refresh WhatsApp webhooks:", error);
		// Non-fatal — continue starting the dev server
	}
}

async function main() {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log("\n🚇 Starting Cloudflare tunnel for webhook development...\n");

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
		console.log(`   Webhooks will be forwarded to localhost:${PORT}`);
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(
			"   Use this URL for Firecrawl and other external services\n",
		);

		// Re-register all WhatsApp channel webhooks with the new tunnel URL
		await refreshWhatsAppWebhooks(tunnelUrl);

		// Set environment variables for the web server
		const env = {
			...process.env,
			VITE_SITE_URL: tunnelUrl,
			BETTER_AUTH_URL: tunnelUrl,
		};

		// Start the dev server from the monorepo root
		// Use __dirname to find the root relative to script location
		const rootDir = path.resolve(__dirname, "../../../..");
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`🚀 Starting development server from ${rootDir}...\n`);

		const devProcess = spawn("pnpm", ["dev"], {
			stdio: "inherit",
			env,
			cwd: rootDir,
		});

		// Handle process termination
		let isCleaningUp = false;
		const cleanup = async (signal: string) => {
			if (isCleaningUp) {
				return;
			}
			isCleaningUp = true;

			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log(
				`\n\n🔌 Received ${signal}, stopping tunnel and dev server...`,
			);

			// Kill the dev process and its children
			try {
				devProcess.kill("SIGTERM");
			} catch {
				// Process may already be dead
			}

			if (tunnel) {
				await tunnel.close();
			}

			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log("✅ Cleanup complete");
			process.exit(0);
		};

		process.on("SIGINT", () => cleanup("SIGINT"));
		process.on("SIGTERM", () => cleanup("SIGTERM"));

		// Wait for dev process to finish
		devProcess.on("close", async (code) => {
			if (isCleaningUp) {
				return;
			}

			// biome-ignore lint/suspicious/noConsole: CLI script output
			console.log("\n🔌 Dev server stopped, closing tunnel...");
			if (tunnel) {
				await tunnel.close();
			}
			process.exit(code ?? 0);
		});
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.error("❌ Failed to start:", error);

		if (tunnel) {
			await tunnel.close();
		}

		process.exit(1);
	}
}

main();
