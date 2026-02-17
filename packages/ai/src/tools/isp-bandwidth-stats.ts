import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	getIspApiConfigFields,
	cleanPhoneNumber,
	ispGet,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

interface BandwidthDataPoint {
	date: string;
	limitUp: number;
	limitDown: number;
	currentUp: number;
	currentDown: number;
}

const ispBandwidthStatsDef = toolDefinition({
	name: "isp-bandwidth-stats",
	description:
		"Get bandwidth usage statistics (time series) for an ISP customer. Returns upload/download speed limits and current usage over time in kbps.",
	inputSchema: z.object({
		query: z.string().describe("Customer phone number or ISP username"),
	}),
});

function createIspBandwidthStatsTool(context: ToolContext) {
	return ispBandwidthStatsDef.server(async (args) => {
		return withIspErrorHandling(
			context,
			"isp-bandwidth-stats",
			async (config) => {
				const query = cleanPhoneNumber(args.query as string);
				const data = await ispGet<BandwidthDataPoint[]>(
					config,
					"/user-stat",
					{
						mobile: query,
					},
				);

				if (!Array.isArray(data) || data.length === 0) {
					return {
						success: false,
						message: `No bandwidth data found for "${args.query}".`,
					};
				}

				const latest = data[data.length - 1];
				let summary = `${data.length} data points.`;
				if (latest) {
					summary += ` Latest reading (${latest.date}): ↓ ${latest.currentDown} kbps / ↑ ${latest.currentUp} kbps (limits: ↓ ${latest.limitDown} kbps / ↑ ${latest.limitUp} kbps).`;
				}

				return {
					success: true,
					message: summary,
					stats: data,
				};
			},
		);
	});
}

export const ispBandwidthStats: RegisteredTool = {
	metadata: {
		id: "isp-bandwidth-stats",
		name: "ISP Bandwidth Stats",
		description:
			"Get bandwidth usage time series for an ISP customer (upload/download speeds)",
		category: "isp",
		requiresConfig: true,
		configFields: getIspApiConfigFields(),
	},
	factory: createIspBandwidthStatsTool,
};
