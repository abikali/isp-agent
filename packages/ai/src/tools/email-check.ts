import net from "node:net";
import tls from "node:tls";
import { tool } from "ai";
import { z } from "zod";
import { validateHost } from "./lib/validate-host";
import type { RegisteredTool } from "./types";

interface ConnectionResult {
	connected: boolean;
	port: number;
	banner: string;
	tls: boolean;
}

function createEmailCheckTool() {
	return tool({
		description:
			"Check IMAP and SMTP server connectivity for an email host. Tests TLS and plaintext connections, reads server banners, and reports which ports are accepting connections. Useful for diagnosing email delivery and mailbox access issues.",
		inputSchema: z.object({
			host: z.string().describe("Email server hostname or IPv4 address"),
			service: z
				.enum(["imap", "smtp", "both"])
				.default("both")
				.describe(
					"Which service to check: imap, smtp, or both (default: both)",
				),
		}),
		execute: async (args) => {
			const hostError = validateHost(args.host);
			if (hostError) {
				return { success: false, message: hostError };
			}

			const results: {
				imap?: ConnectionResult | undefined;
				smtp?: ConnectionResult | undefined;
			} = {};

			if (args.service === "imap" || args.service === "both") {
				results.imap = await checkImap(args.host);
			}

			if (args.service === "smtp" || args.service === "both") {
				results.smtp = await checkSmtp(args.host);
			}

			const parts: string[] = [];
			if (results.imap) {
				parts.push(
					results.imap.connected
						? `IMAP: connected on port ${results.imap.port}${results.imap.tls ? " (TLS)" : ""}`
						: "IMAP: not reachable",
				);
			}
			if (results.smtp) {
				parts.push(
					results.smtp.connected
						? `SMTP: connected on port ${results.smtp.port}${results.smtp.tls ? " (TLS)" : ""}`
						: "SMTP: not reachable",
				);
			}

			const anyConnected = Object.values(results).some(
				(r) => r?.connected,
			);

			return {
				success: anyConnected,
				message: `Email check for ${args.host}: ${parts.join(", ")}`,
				results,
			};
		},
	});
}

async function checkImap(host: string): Promise<ConnectionResult> {
	// Try TLS first (993), then plaintext (143)
	const tlsResult = await connectAndReadBanner(host, 993, true, 10000);
	if (tlsResult.connected) {
		return tlsResult;
	}

	return connectAndReadBanner(host, 143, false, 10000);
}

async function checkSmtp(host: string): Promise<ConnectionResult> {
	// Try TLS first (465), then submission (587), then plaintext (25)
	const tlsResult = await connectAndReadBanner(host, 465, true, 10000);
	if (tlsResult.connected) {
		return tlsResult;
	}

	const submissionResult = await connectAndReadBanner(
		host,
		587,
		false,
		10000,
	);
	if (submissionResult.connected) {
		return submissionResult;
	}

	return connectAndReadBanner(host, 25, false, 10000);
}

function connectAndReadBanner(
	host: string,
	port: number,
	useTls: boolean,
	timeout: number,
): Promise<ConnectionResult> {
	return new Promise((resolve) => {
		let banner = "";
		let settled = false;

		const finish = (connected: boolean) => {
			if (!settled) {
				settled = true;
				resolve({
					connected,
					port,
					banner: banner.trim(),
					tls: useTls,
				});
			}
		};

		const onData = (data: Buffer) => {
			banner += data.toString("utf8");
			// We only need the first line of the banner
			if (banner.includes("\n")) {
				banner = banner.split("\n")[0] ?? banner;
				socket.destroy();
				finish(true);
			}
		};

		const onError = () => {
			socket.destroy();
			finish(false);
		};

		const timer = setTimeout(() => {
			socket.destroy();
			// If we got partial data before timeout, still count as connected
			if (banner.length > 0) {
				finish(true);
			} else {
				finish(false);
			}
		}, timeout);

		let socket: net.Socket | tls.TLSSocket;

		if (useTls) {
			socket = tls.connect(
				{ host, port, timeout, rejectUnauthorized: false },
				() => {
					// Connected, wait for banner data
				},
			);
		} else {
			socket = net.connect({ host, port, timeout }, () => {
				// Connected, wait for banner data
			});
		}

		socket.setTimeout(timeout);
		socket.on("data", onData);
		socket.on("error", onError);
		socket.on("timeout", () => {
			socket.destroy();
			if (banner.length > 0) {
				finish(true);
			} else {
				finish(false);
			}
		});
		socket.on("close", () => {
			clearTimeout(timer);
			finish(banner.length > 0);
		});
	});
}

export const emailCheck: RegisteredTool = {
	metadata: {
		id: "email-check",
		name: "Email Check",
		description:
			"Check IMAP and SMTP server connectivity and read server banners",
		category: "diagnostics",
		requiresConfig: false,
	},
	factory: createEmailCheckTool,
};
