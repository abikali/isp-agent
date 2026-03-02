import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	cleanPhoneNumber,
	getIspApiConfigFields,
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
		"Get bandwidth usage time series for an ISP customer. " +
		"Returns array of data points with date, limitUp/limitDown, currentUp/currentDown (all in kbps).",
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
					const percentDown =
						latest.limitDown > 0
							? Math.round(
									(latest.currentDown / latest.limitDown) *
										100,
								)
							: 0;
					const percentUp =
						latest.limitUp > 0
							? Math.round(
									(latest.currentUp / latest.limitUp) * 100,
								)
							: 0;
					summary += ` Latest reading (${latest.date}): download at ${percentDown}% of plan limit, upload at ${percentUp}% of plan limit.`;
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
