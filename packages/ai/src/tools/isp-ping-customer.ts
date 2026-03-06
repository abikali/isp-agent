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
		"Ping a customer's device from the ISP network. Returns packet loss percentage and round-trip times (min/avg/max ms). " +
		"High packet loss (>50%) or all timeouts usually means the customer's device is unreachable (firewall, NAT, or truly offline). " +
		"Low packet loss with good RTT (<50ms) means the link to the customer is healthy.",
	inputSchema: z.object({
		query: z.string().describe("Customer phone number or ISP username"),
	}),
});

interface ParsedPingResult {
	packetsSent: number;
	packetsReceived: number;
	packetLossPercent: number;
	rttMin: number | null;
	rttAvg: number | null;
	rttMax: number | null;
	summary: string;
}

function parsePingOutput(raw: unknown): ParsedPingResult | null {
	if (!Array.isArray(raw)) {
		return null;
	}

	const lines = raw as string[];
	let packetsSent = 0;
	let packetsReceived = 0;
	let packetLossPercent = 100;
	const rtts: number[] = [];

	for (const line of lines) {
		// Parse summary line: "sent=20 received=0 packet-loss=100%"
		const summaryMatch = line.match(
			/sent=(\d+)\s+received=(\d+)\s+packet-loss=(\d+)%/,
		);
		if (summaryMatch) {
			packetsSent = Number.parseInt(summaryMatch[1] as string, 10);
			packetsReceived = Number.parseInt(summaryMatch[2] as string, 10);
			packetLossPercent = Number.parseInt(summaryMatch[3] as string, 10);
			continue;
		}

		// Skip summary rtt lines (min-rtt, avg-rtt, max-rtt) and metadata lines
		if (/(?:min|avg|max)-rtt=/.test(line) || line.includes("exit-status")) {
			continue;
		}

		// Parse individual ping lines with TIME value (e.g., "0 172.23.19.53  56  64  13ms710us")
		const timeMatch = line.match(/(\d+(?:\.\d+)?)ms/);
		if (timeMatch && !line.includes("timeout")) {
			rtts.push(Number.parseFloat(timeMatch[1] as string));
		}
	}

	const rttMin = rtts.length > 0 ? Math.min(...rtts) : null;
	const rttMax = rtts.length > 0 ? Math.max(...rtts) : null;
	const rttAvg =
		rtts.length > 0
			? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length)
			: null;

	let summary: string;
	if (packetLossPercent === 100) {
		summary = `All ${packetsSent} packets lost (100% packet loss). Customer device is unreachable — may be behind NAT/firewall or truly offline.`;
	} else if (packetLossPercent === 0) {
		summary = `${packetsSent}/${packetsSent} packets received (0% loss). RTT: min=${rttMin}ms, avg=${rttAvg}ms, max=${rttMax}ms. Link is healthy.`;
	} else {
		summary = `${packetsReceived}/${packetsSent} packets received (${packetLossPercent}% loss). RTT: min=${rttMin}ms, avg=${rttAvg}ms, max=${rttMax}ms. Unstable connection.`;
	}

	return {
		packetsSent,
		packetsReceived,
		packetLossPercent,
		rttMin,
		rttAvg,
		rttMax,
		summary,
	};
}

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

				if (!data) {
					return {
						success: false,
						message: `No ping data returned for "${args.query}". The customer may not exist in the ISP system.`,
					};
				}

				const parsed = parsePingOutput(data);
				if (parsed) {
					return {
						success: true,
						message: parsed.summary,
						packetLossPercent: parsed.packetLossPercent,
						rttMin: parsed.rttMin,
						rttAvg: parsed.rttAvg,
						rttMax: parsed.rttMax,
						packetsSent: parsed.packetsSent,
						packetsReceived: parsed.packetsReceived,
					};
				}

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
