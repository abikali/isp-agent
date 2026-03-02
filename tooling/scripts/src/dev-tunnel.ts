import { type ChildProcess, spawn } from "node:child_process";
import { decryptToken, telegram, whatsapp } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";

function startNgrokTunnel(
	port: number,
): Promise<{ url: string; process: ChildProcess }> {
	return new Promise((resolve, reject) => {
		const ngrok = spawn(
			"ngrok",
			["http", String(port), "--log", "stdout", "--log-format", "json"],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let resolved = false;

		ngrok.stdout?.on("data", (data: Buffer) => {
			const lines = data.toString().split("\n").filter(Boolean);
			for (const line of lines) {
				try {
					const log = JSON.parse(line);
					if (log.url?.startsWith("https://") && !resolved) {
						resolved = true;
						resolve({ url: log.url, process: ngrok });
					}
				} catch {
					// not JSON, ignore
				}
			}
		});

		ngrok.on("error", (err) => {
			if (!resolved) {
				reject(new Error(`Failed to start ngrok: ${err.message}`));
			}
		});

		ngrok.on("exit", (code) => {
			if (!resolved) {
				reject(new Error(`ngrok exited with code ${code}`));
			}
		});

		setTimeout(() => {
			if (!resolved) {
				ngrok.kill();
				reject(new Error("ngrok tunnel timed out after 15s"));
			}
		}, 15_000);
	});
}

async function updateWebhooks(tunnelUrl: string) {
	const channels = await db.aiAgentChannel.findMany({
		where: { enabled: true },
		select: {
			id: true,
			provider: true,
			webhookToken: true,
			webhookSecret: true,
			encryptedApiToken: true,
			providerMetadata: true,
		},
	});

	logger.info(`Found ${channels.length} enabled channel(s)`);

	for (const channel of channels) {
		if (channel.provider === "whatsapp") {
			const metadata = channel.providerMetadata as Record<
				string,
				string
			> | null;
			const sessionId = metadata?.["sessionId"];
			const encryptedPat = metadata?.["encryptedPersonalAccessToken"];
			if (!sessionId || !encryptedPat) {
				logger.warn(
					`Skipping WhatsApp channel ${channel.id} — missing providerMetadata (sessionId/encryptedPersonalAccessToken). Re-create the channel to persist credentials.`,
				);
				continue;
			}

			const pat = decryptToken(encryptedPat);
			const webhookUrl = `${tunnelUrl}/api/webhooks/chat/whatsapp/${channel.webhookToken}`;
			const success = await whatsapp.setWebhook(
				pat,
				sessionId,
				webhookUrl,
			);

			if (success) {
				logger.success(
					`WhatsApp channel ${channel.id} → ${webhookUrl}`,
				);
			} else {
				logger.error(
					`Failed to update WhatsApp webhook for channel ${channel.id}`,
				);
			}
		}

		if (channel.provider === "telegram") {
			const apiToken = decryptToken(channel.encryptedApiToken);
			const webhookUrl = `${tunnelUrl}/api/webhooks/chat/telegram/${channel.webhookToken}`;
			const success = await telegram.setWebhook(
				apiToken,
				webhookUrl,
				channel.webhookSecret ?? "",
			);

			if (success) {
				logger.success(
					`Telegram channel ${channel.id} → ${webhookUrl}`,
				);
			} else {
				logger.error(
					`Failed to update Telegram webhook for channel ${channel.id}`,
				);
			}
		}
	}
}

async function main() {
	// 1. Start ngrok tunnel (trycloudflare.com is blocked by Wasender)
	logger.info("Starting ngrok tunnel to localhost:5050...");
	const tunnel = await startNgrokTunnel(5050);
	logger.success(`Tunnel ready: ${tunnel.url}`);

	// 2. Update webhooks (ngrok domains are immediately resolvable)
	await updateWebhooks(tunnel.url);

	// 3. Start dev server
	logger.info("Starting dev server...");
	const child = spawn("pnpm", ["dev"], {
		cwd: process.cwd().replace(/tooling\/scripts$/, ""),
		stdio: "inherit",
		env: {
			...process.env,
			VITE_SITE_URL: tunnel.url,
			BETTER_AUTH_URL: tunnel.url,
		},
	});

	// 4. Cleanup on exit
	function cleanup() {
		logger.info("Shutting down...");
		child.kill("SIGTERM");
		tunnel.process.kill("SIGTERM");
		process.exit(0);
	}

	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
	child.on("exit", (code) => {
		tunnel.process.kill("SIGTERM");
		process.exit(code ?? 0);
	});
}

main().catch((error) => {
	logger.error("dev-tunnel failed", { error });
	process.exit(1);
});
