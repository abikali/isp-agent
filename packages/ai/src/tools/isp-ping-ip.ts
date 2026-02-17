import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	getIspApiConfigFields,
	ispGet,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

const ispPingIpDef = toolDefinition({
	name: "isp-ping-ip",
	description:
		"Ping any IP address from the ISP network. Useful for diagnosing network connectivity issues to specific hosts or infrastructure.",
	inputSchema: z.object({
		ipAddress: z.string().describe("IP address to ping"),
	}),
});

function createIspPingIpTool(context: ToolContext) {
	return ispPingIpDef.server(async (args) => {
		return withIspErrorHandling(context, "isp-ping-ip", async (config) => {
			const ip = args.ipAddress as string;
			const data = await ispGet<unknown>(config, "/ping", {
				ipAddress: ip,
			});

			return {
				success: true,
				message: `Ping result for ${ip}:`,
				pingResult: data,
			};
		});
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
