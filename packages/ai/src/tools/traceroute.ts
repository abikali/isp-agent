import { tool } from "ai";
import { z } from "zod";
import { loadTraceroute } from "./lib/external";
import { validateHost } from "./lib/validate-host";
import type { RegisteredTool } from "./types";

interface TracerouteHop {
	hop: number;
	ip: string;
	rtt: string;
}

function createTracerouteTool() {
	return tool({
		description:
			"Trace the network path to a host, showing each hop along the route with IP addresses and round-trip times. Useful for diagnosing routing issues and identifying where packets are being dropped.",
		inputSchema: z.object({
			host: z
				.string()
				.describe("Hostname or IPv4 address to trace route to"),
			maxHops: z
				.number()
				.int()
				.min(1)
				.max(64)
				.default(30)
				.describe("Maximum number of hops (default: 30)"),
		}),
		execute: async (args) => {
			const hostError = validateHost(args.host);
			if (hostError) {
				return { success: false, message: hostError };
			}

			try {
				const Traceroute = loadTraceroute();
				const hops: TracerouteHop[] = [];

				const result = await new Promise<{
					hops: TracerouteHop[];
					error?: string | undefined;
				}>((resolve) => {
					const tracer = new Traceroute();
					let settled = false;

					const timer = setTimeout(() => {
						if (!settled) {
							settled = true;
							resolve({
								hops,
								error: "Traceroute timed out after 30 seconds",
							});
						}
					}, 30000);

					tracer.on("hop", (hop: unknown) => {
						const h = hop as {
							hop: number;
							ip: string;
							rtt1: string;
						};
						hops.push({
							hop: h.hop,
							ip: h.ip,
							rtt: h.rtt1,
						});
					});

					tracer.on("close", () => {
						if (!settled) {
							settled = true;
							clearTimeout(timer);
							resolve({ hops });
						}
					});

					tracer.on("error", (err: unknown) => {
						if (!settled) {
							settled = true;
							clearTimeout(timer);
							resolve({
								hops,
								error:
									err instanceof Error
										? err.message
										: String(err),
							});
						}
					});

					tracer.trace(args.host);
				});

				if (result.hops.length === 0 && result.error) {
					return {
						success: false,
						message: `Traceroute failed: ${result.error}`,
					};
				}

				const message = result.error
					? `Traceroute to ${args.host} (partial, ${result.hops.length} hops): ${result.error}`
					: `Traceroute to ${args.host} completed with ${result.hops.length} hops`;

				return {
					success: true,
					message,
					hops: result.hops,
				};
			} catch (error) {
				return {
					success: false,
					message: `Traceroute failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		},
	});
}

export const traceroute: RegisteredTool = {
	metadata: {
		id: "traceroute",
		name: "Traceroute",
		description:
			"Trace the network path to a host to diagnose routing issues",
		category: "diagnostics",
		requiresConfig: false,
	},
	factory: createTracerouteTool,
};
