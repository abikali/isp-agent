/**
 * Tunnel Manager for E2E Tests
 *
 * Uses Cloudflare Quick Tunnels (via untun) to expose the local dev server
 * to the internet so that external services (like Firecrawl) can send webhooks.
 *
 * This enables full end-to-end testing of webhook-based features.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTunnel as startCloudflaredTunnel } from "untun";

// File to store tunnel URL for cross-process communication
// Uses OS temp directory to avoid polluting the project directory
const TUNNEL_URL_FILE = path.join(os.tmpdir(), "libancom-e2e-tunnel-url");

// Store the tunnel instance for cleanup
let tunnelInstance: Awaited<ReturnType<typeof startCloudflaredTunnel>> | null =
	null;

/**
 * Start a tunnel to expose localhost to the internet
 * Uses Cloudflare Quick Tunnels which don't require authentication
 * and don't have protection pages that block automated requests.
 *
 * @param port - Local port to expose (default: 3030)
 * @returns The public tunnel URL
 */
export async function startTunnel(port = 3030): Promise<string> {
	// biome-ignore lint/suspicious/noConsole: CLI script output
	console.log(`🚇 Starting Cloudflare tunnel to localhost:${port}...`);

	try {
		tunnelInstance = await startCloudflaredTunnel({
			port,
			acceptCloudflareNotice: true,
		});

		const tunnelUrl = await tunnelInstance.getURL();
		if (!tunnelUrl) {
			throw new Error("Failed to get tunnel URL");
		}

		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log(`✅ Tunnel established: ${tunnelUrl}`);

		// Write URL to file for other processes to read
		fs.writeFileSync(TUNNEL_URL_FILE, tunnelUrl);

		return tunnelUrl;
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.error("❌ Failed to start tunnel:", error);
		throw error;
	}
}

/**
 * Stop the tunnel and clean up
 */
export async function stopTunnel(): Promise<void> {
	if (tunnelInstance) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.log("🔌 Stopping tunnel...");
		await tunnelInstance.close();
		tunnelInstance = null;
	}

	// Clean up the URL file
	if (fs.existsSync(TUNNEL_URL_FILE)) {
		fs.unlinkSync(TUNNEL_URL_FILE);
	}
}

/**
 * Get the tunnel URL from the file (for use by other processes)
 * Returns null if no tunnel is running
 */
export function getTunnelUrl(): string | null {
	if (fs.existsSync(TUNNEL_URL_FILE)) {
		return fs.readFileSync(TUNNEL_URL_FILE, "utf-8").trim();
	}
	return null;
}

/**
 * Check if tunnel is enabled via environment variable
 */
export function isTunnelEnabled(): boolean {
	return process.env["E2E_USE_TUNNEL"] === "true";
}

/**
 * Verify that the tunnel is healthy and can receive webhooks
 * Makes a request to the health endpoint through the tunnel
 *
 * @param tunnelUrl - The tunnel URL to verify
 * @returns true if tunnel is healthy, false otherwise
 */
export async function verifyTunnelHealth(tunnelUrl: string): Promise<boolean> {
	try {
		const response = await fetch(`${tunnelUrl}/api/health`, {
			method: "GET",
			signal: AbortSignal.timeout(10000), // 10 second timeout
		});
		return response.ok;
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: CLI script output
		console.warn("⚠️ Tunnel health check failed:", error);
		return false;
	}
}
