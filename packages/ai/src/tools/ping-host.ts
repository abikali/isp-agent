import net from "node:net";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { validateHost } from "./lib/validate-host";
import type { RegisteredTool } from "./types";

const pingHostDef = toolDefinition({
	name: "ping-host",
	description:
		"Perform a TCP ping to a host to measure latency and check reachability. Connects to the specified port multiple times and reports round-trip time statistics.",
	inputSchema: z.object({
		host: z.string().describe("Hostname or IPv4 address to ping"),
		port: z
			.number()
			.int()
			.min(1)
			.max(65535)
			.default(80)
			.describe("TCP port to connect to (default: 80)"),
		count: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(4)
			.describe("Number of ping attempts (default: 4, max: 10)"),
	}),
});

function createPingHostTool() {
	return pingHostDef.server(async (args) => {
		const host = args.host as string;
		const port = (args.port as number) ?? 80;
		const count = (args.count as number) ?? 4;

		const hostError = validateHost(host);
		if (hostError) {
			return { success: false, message: hostError };
		}

		const results: number[] = [];
		let failures = 0;

		for (let i = 0; i < count; i++) {
			try {
				const rtt = await tcpPing(host, port, 5000);
				results.push(rtt);
			} catch {
				failures++;
			}
		}

		if (results.length === 0) {
			return {
				success: false,
				message: `Host ${host}:${port} is unreachable. All ${count} attempts failed.`,
			};
		}

		const min = Math.min(...results);
		const max = Math.max(...results);
		const avg = results.reduce((sum, val) => sum + val, 0) / results.length;
		const packetLoss = Math.round((failures / count) * 100);

		return {
			success: true,
			message: `Ping ${host}:${port} — ${results.length}/${count} successful, avg ${avg.toFixed(1)}ms, min ${min.toFixed(1)}ms, max ${max.toFixed(1)}ms, ${packetLoss}% packet loss`,
			stats: {
				min: Math.round(min * 100) / 100,
				max: Math.round(max * 100) / 100,
				avg: Math.round(avg * 100) / 100,
				packetLoss,
			},
		};
	});
}

function tcpPing(host: string, port: number, timeout: number): Promise<number> {
	return new Promise((resolve, reject) => {
		const start = performance.now();
		const socket = net.connect({ host, port, timeout }, () => {
			const rtt = performance.now() - start;
			socket.destroy();
			resolve(rtt);
		});
		socket.setTimeout(timeout);
		socket.on("timeout", () => {
			socket.destroy();
			reject(new Error("Timeout"));
		});
		socket.on("error", (err) => {
			socket.destroy();
			reject(err);
		});
	});
}

export const pingHost: RegisteredTool = {
	metadata: {
		id: "ping-host",
		name: "Ping Host",
		description:
			"TCP ping a host to measure latency and check reachability",
		category: "diagnostics",
		requiresConfig: false,
	},
	factory: createPingHostTool,
};
