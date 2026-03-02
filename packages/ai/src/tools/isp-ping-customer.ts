import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	cleanPhoneNumber,
	getIspApiConfigFields,
	ispGet,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

const ispPingCustomerDef = toolDefinition({
	name: "isp-ping-customer",
	description:
		"Ping a customer's device from the ISP network. Returns packet loss percentage and round-trip times (min/avg/max ms).",
	inputSchema: z.object({
		query: z.string().describe("Customer phone number or ISP username"),
	}),
});

function createIspPingCustomerTool(context: ToolContext) {
	return ispPingCustomerDef.server(async (args) => {
		return withIspErrorHandling(
			context,
			"isp-ping-customer",
			async (config) => {
				const query = cleanPhoneNumber(args.query as string);
				const data = await ispGet<unknown>(config, "/user-ping", {
					mobile: query,
				});

				return {
					success: true,
					message: `Ping result for "${args.query}":`,
					pingResult: data,
				};
			},
		);
	});
}

export const ispPingCustomer: RegisteredTool = {
	metadata: {
		id: "isp-ping-customer",
		name: "ISP Ping Customer",
		description:
			"Ping a customer from the ISP network to check connection reachability",
		category: "isp",
		requiresConfig: true,
		configFields: getIspApiConfigFields(),
	},
	factory: createIspPingCustomerTool,
};
