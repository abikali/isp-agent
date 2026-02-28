import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
	cleanPhoneNumber,
	getIspApiConfigFields,
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
	description: `Search for an ISP customer by phone number or username. Returns account status, connection details, network topology (station → access point → customer), and diagnostic data.

Troubleshooting guide:

CHECK THESE FIRST (deal-breakers — if any apply, this IS the diagnosis, no further tools needed):
- active: If false, the account is DISABLED. The customer cannot connect at all. Tell them their account is inactive and needs to be reactivated. Do NOT proceed with ping/bandwidth/AP checks — they will all fail because the account is disabled.
- blocked: If true, the account is BLOCKED (usually non-payment). The customer cannot connect. Tell them and suggest contacting billing.
- expiryAccount: If the date is in the past, the account is EXPIRED. The customer cannot connect. Tell them their subscription needs renewal.
- Read these values carefully from the tool result. Do NOT misreport them (e.g. do not say "active" when the value is false).

THEN determine connection type:
- WIRELESS customer: If accessPointName is NOT null, the customer connects through a wireless access point — regardless of what mikrotikInterface contains. Use the AP-based diagnostic chain (stationOnline → accessPointOnline → online, accessPointUsers for cross-checking).
- FIBER/WIRED customer: If accessPointName IS null AND mikrotikInterface contains "ether", "base", or "olt" (e.g. "ether3-OutToCRS-...", "olt1-PON2-..."), the customer is on a wired/fiber connection. All AP/station fields being null/false/empty is NORMAL — do NOT report it as a problem. For these customers, use isp-mikrotik-users (pass the full mikrotikInterface value) instead of accessPointUsers to find other users on the same interface for cross-checking. Then ping those users with isp-ping-customer.
- NEVER use isp-mikrotik-users for wireless customers. NEVER call a customer "wired/fiber" when they have AP data.
- fupMode: "0" = normal, "1" = throttled (customer exceeded data quota, reduced speeds until reset).
- stationOnline → accessPointOnline → online: Follow this chain to locate network issues ONLY for wireless customers (not ether/base/olt). Station down = all customers on that station affected. AP down = all customers on that AP affected. Individual offline = customer-specific issue.
- accessPointSignal: Signal strength in dBm. -50 to -60 excellent, -60 to -70 good, -70 to -80 fair, below -80 poor/unstable.
- accessPointUsers: Array of {userName, online} objects for all customers on this AP. IMPORTANT: You can use these userNames with isp-ping-customer to cross-check if an issue is customer-specific or AP-wide. When a customer's ping fails or connection is down, ALWAYS ping at least one other online user from this list to verify the AP is working. If very large (>30 entries), the AP may be overloaded.
- accessPointInterfaceStats / stationInterfaceStats: Check the "rate" field. A rate of "100Mbps" or "1Gbps" is normal. A rate of "10Mbps" indicates a hardware or cabling issue — if "10Mbps" appears on the AP interface, the access point has a problem (bad cable, port negotiation failure); if "10Mbps" appears on the station interface, the station has the problem. A 10Mbps link bottlenecks all customers on that device and is a common cause of slow speeds across an entire AP or station.

Field reference:
- firstName, lastName, userName: Customer identity. userName is the PPPoE/Hotspot login.
- online: Whether currently connected. false = disconnected, router off, or simply offline.
- active: Whether account is enabled. Inactive accounts cannot connect.
- blocked: Whether blocked by ISP (e.g. non-payment). Cannot connect even if active.
- archived: Whether account is decommissioned.
- activatedAccount: false if never activated, or a date string when first activated.
- expiryAccount: Subscription expiry date (ISO string).
- accountTypeName: Subscription plan name (e.g. "10Mbps Unlimited").
- ipAddress: Assigned IP on the ISP network.
- mikrotikInterface: MikroTik router interface the customer connects through.
- basicSpeedUp/basicSpeedDown: Speed limits in kbps.
- dailyQuota/monthlyQuota: Data quotas (string, in MB). "0" = unlimited.
- userUpTime: Current session duration (e.g. "1h20m10s").
- stationOnline/stationName/stationIpAddress/stationUpTime: Station (tower/node) serving this customer.
- accessPointOnline/accessPointName/accessPointIpAddress/accessPointUpTime/accessPointBoardName: Access point (radio) on the station.
- accessPointSignal: Signal dBm between customer and AP (null if no AP data).
- accessPointUsers: Array of {userName, online} on this AP. Use these userNames with isp-ping-customer to verify AP health.
- accessPointInterfaceStats: AP ethernet interface stats. ALWAYS check the "rate" field — "10Mbps" means a cabling/port issue on the AP.
- stationInterfaceStats: Station ethernet interface stats. ALWAYS check the "rate" field — "10Mbps" means a cabling/port issue on the station.
- userSessions: Array of recent sessions with startSession, endSession, sessionTime.
- pingResult: Ping results from ISP network to customer device.
- creationDate, lastLogin, lastLogOut: Account dates.

Does NOT return billing amounts or personal contact info (phone/email/address are stripped).`,
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
					multipleMatches: true,
					message: `Found ${filtered.length} customers matching "${args.query}". Ask the customer which account is theirs by presenting the names/usernames so they can identify themselves.`,
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
