import { tool } from "ai";
import { z } from "zod";
import { loadSpeedTest, type SpeedTestResult } from "./lib/external";
import type { RegisteredTool } from "./types";

function createSpeedTestTool() {
	return tool({
		description:
			"Run an internet speed test using Ookla's speedtest infrastructure. Measures download speed, upload speed, and ping latency. This test takes 30-60 seconds to complete.",
		inputSchema: z.object({}),
		execute: async () => {
			try {
				const speedTestFn = loadSpeedTest();
				const result = await runWithTimeout(speedTestFn, 60000);

				return {
					success: true,
					message: `Speed test complete — Download: ${formatSpeed(result.download.bandwidth)}, Upload: ${formatSpeed(result.upload.bandwidth)}, Ping: ${result.ping.latency.toFixed(1)}ms, Server: ${result.server.name} (${result.server.location})`,
					results: {
						download: formatSpeed(result.download.bandwidth),
						upload: formatSpeed(result.upload.bandwidth),
						ping: Math.round(result.ping.latency * 100) / 100,
						server: `${result.server.name} (${result.server.location})`,
					},
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";

				if (
					message.includes("ENOENT") ||
					message.includes("not found")
				) {
					return {
						success: false,
						message:
							"Speed test CLI is not installed. Install it with: npm install -g speedtest-net",
					};
				}

				return {
					success: false,
					message: `Speed test failed: ${message}`,
				};
			}
		},
	});
}

function runWithTimeout(
	speedTestFn: (
		options?: Record<string, unknown>,
	) => Promise<SpeedTestResult>,
	timeout: number,
): Promise<SpeedTestResult> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("Speed test timed out after 60 seconds"));
		}, timeout);

		speedTestFn({ acceptLicense: true, acceptGdpr: true })
			.then((result) => {
				clearTimeout(timer);
				resolve(result);
			})
			.catch((err: unknown) => {
				clearTimeout(timer);
				reject(err);
			});
	});
}

function formatSpeed(bytesPerSecond: number): string {
	const mbps = (bytesPerSecond * 8) / 1_000_000;
	return `${mbps.toFixed(2)} Mbps`;
}

export const speedTest: RegisteredTool = {
	metadata: {
		id: "speed-test",
		name: "Speed Test",
		description:
			"Run an internet speed test measuring download, upload, and ping",
		category: "diagnostics",
		requiresConfig: false,
	},
	factory: createSpeedTestTool,
};
