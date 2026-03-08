import { tool } from "ai";
import { z } from "zod";
import {
	getIspApiConfigFields,
	ispGet,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

function createIspPingIpTool(context: ToolContext) {
	return tool({
		description:
			"Ping any IP address from the ISP network. Useful for diagnosing network connectivity issues to specific hosts or infrastructure.",
		inputSchema: z.object({
			ipAddress: z.string().describe("IP address to ping"),
		}),
		execute: async ({ ipAddress }) => {
			return withIspErrorHandling(
				context,
				"isp-ping-ip",
				async (config) => {
					const ip = ipAddress;
					const data = await ispGet<unknown>(config, "/ping", {
						ipAddress: ip,
					});

					if (!data) {
						return {
							success: false,
							message: `No ping data returned for ${ip}.`,
						};
					}

					return {
						success: true,
						message: `Ping result for ${ip}:`,
						pingResult: data,
					};
				},
			);
		},
	});
}

export const ispPingIp: RegisteredTool = {
	metadata: {
		id: "isp-ping-ip",
		name: "ISP Ping IP",
		description:
			"Ping any IP address from the ISP network for connectivity diagnostics",
		category: "isp",
		requiresConfig: true,
		configFields: getIspApiConfigFields(),
	},
	factory: createIspPingIpTool,
};
