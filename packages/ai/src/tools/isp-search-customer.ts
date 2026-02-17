import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	getIspApiConfigFields,
	cleanPhoneNumber,
	ispGet,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

/** Whitelist of fields safe for the AI to see. */
const WHITELISTED_FIELDS = [
	// Identity
	"firstName",
	"lastName",
	"userName",
	// Account status
	"online",
	"active",
	"blocked",
	"archived",
	"activatedAccount",
	"expiryAccount",
	"accountTypeName",
	"fupMode",
	// Network
	"ipAddress",
	"mikrotikInterface",
	"routerBrand",
	// Speed & Quota
	"basicSpeedUp",
	"basicSpeedDown",
	"dailyQuota",
	"monthlyQuota",
	"userUpTime",
	// Station
	"stationOnline",
	"stationName",
	"stationIpAddress",
	"stationUpTime",
	"stationInterfaceStats",
	// Access Point
	"accessPointOnline",
	"accessPointName",
	"accessPointBoardName",
	"accessPointIpAddress",
	"accessPointUpTime",
	"accessPointSignal",
	"accessPointInterfaceStats",
	"accessPointUsers",
	// Sessions & Ping
	"userSessions",
	"pingResult",
	// Dates
	"creationDate",
	"lastLogin",
	"lastLogOut",
] as const;

function filterCustomerData(
	raw: Record<string, unknown>,
): Record<string, unknown> {
	const filtered: Record<string, unknown> = {};
	for (const field of WHITELISTED_FIELDS) {
		if (field in raw) {
			filtered[field] = raw[field];
		}
	}
	return filtered;
}

const ispSearchCustomerDef = toolDefinition({
	name: "isp-search-customer",
	description:
		"Search for an ISP customer by phone number or username. Returns account status, connection details, network info, sessions, and ping results. Does NOT return billing or personal contact info.",
	inputSchema: z.object({
		query: z
			.string()
			.describe("Customer phone number or ISP username to search for"),
	}),
});

function createIspSearchCustomerTool(context: ToolContext) {
	return ispSearchCustomerDef.server(async (args) => {
		return withIspErrorHandling(
			context,
			"isp-search-customer",
			async (config) => {
				const query = cleanPhoneNumber(args.query as string);
				const data = await ispGet<
					Record<string, unknown> | Record<string, unknown>[]
				>(config, "/user-info", { mobile: query });

				// API may return a single object or an array
				const customers = Array.isArray(data) ? data : [data];

				if (customers.length === 0) {
					return {
						success: false,
						message: `No customer found for "${args.query}".`,
					};
				}

				const filtered = customers.map(filterCustomerData);

				const first = filtered[0];
				if (filtered.length === 1 && first) {
					return {
						success: true,
						message: `Found customer "${first["userName"] ?? args.query}".`,
						customer: first,
					};
				}

				return {
					success: true,
					message: `Found ${filtered.length} customers matching "${args.query}".`,
					customers: filtered,
				};
			},
		);
	});
}

export const ispSearchCustomer: RegisteredTool = {
	metadata: {
		id: "isp-search-customer",
		name: "ISP Search Customer",
		description:
			"Search ISP customer by phone or username — returns filtered diagnostic data only",
		category: "isp",
		requiresConfig: true,
		configFields: getIspApiConfigFields(),
	},
	factory: createIspSearchCustomerTool,
};
