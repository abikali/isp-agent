import { spawn } from "node:child_process";
import { decryptToken, telegram, whatsapp } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { startTunnel } from "untun";

async function main() {
	// 1. Start Cloudflare tunnel
	logger.info("Starting Cloudflare tunnel to localhost:5050...");
	const maybeTunnel = await startTunnel({
		port: 5050,
		acceptCloudflareNotice: true,
	});
	if (!maybeTunnel) {
		throw new Error("Failed to start tunnel");
	}
	const tunnel = maybeTunnel;
	const tunnelUrl = await tunnel.getURL();
	logger.success(`Tunnel ready: ${tunnelUrl}`);

	// 2. Load all enabled channels
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

	// 3. Update webhooks for each channel
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

	// 4. Start dev server with tunnel URL as site URL
	logger.info("Starting dev server...");
	const child = spawn("pnpm", ["dev"], {
		cwd: process.cwd().replace(/tooling\/scripts$/, ""),
		stdio: "inherit",
		env: {
			...process.env,
			VITE_SITE_URL: tunnelUrl,
			BETTER_AUTH_URL: tunnelUrl,
		},
	});

	// 5. Cleanup on exit
	function cleanup() {
		logger.info("Shutting down...");
		child.kill("SIGTERM");
		tunnel.close();
		process.exit(0);
	}

	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
	child.on("exit", (code) => {
		tunnel.close();
		process.exit(code ?? 0);
	});
}

main().catch((error) => {
	logger.error("dev-tunnel failed", { error });
	process.exit(1);
});
