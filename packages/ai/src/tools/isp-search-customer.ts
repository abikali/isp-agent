import { tool } from "ai";
import { z } from "zod";
import {
	cleanPhoneNumber,
	getIspApiConfigFields,
	ispGet,
	isSearchableQuery,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

/** Whitelist of fields safe for the AI to see. */
export const WHITELISTED_FIELDS = [
	// Identity
	"firstName",
	"lastName",
	"userName",
	"address",
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

export function filterCustomerData(
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

/** Matches interfaces that need mikrotik API for peer data (fiber/wired/cable). */
export const MIKROTIK_PEER_IFACE = /\bOLT\d*\b|\bether\d*\b|\bbase\d*\b/i;

export function detectConnectionType(
	customer: Record<string, unknown>,
): "wireless" | "fiber" | "wired" {
	const iface = customer["mikrotikInterface"] as string | undefined;
	if (iface && MIKROTIK_PEER_IFACE.test(iface)) {
		return iface.toUpperCase().includes("OLT") ? "fiber" : "wired";
	}
	if (customer["accessPointName"] != null) {
		return "wireless";
	}
	return "wired"; // fallback
}

export function needsMikrotikPeers(customer: Record<string, unknown>): boolean {
	const iface = customer["mikrotikInterface"] as string | undefined;
	return !!iface && MIKROTIK_PEER_IFACE.test(iface);
}

function createIspSearchCustomerTool(context: ToolContext) {
	return tool({
		description:
			"Search for an ISP customer by phone number or username. Returns account status (active, blocked, expiryAccount), " +
			"connection details (fupMode, speeds, quotas), network topology (station, access point, mikrotikInterface), " +
			"and accessPointUsers (peers on the same AP for cross-checking). Does NOT return billing or personal contact info.",
		inputSchema: z.object({
			query: z
				.string()
				.describe(
					"Customer phone number or ISP username to search for",
				),
		}),
		execute: async (args) => {
			if (!isSearchableQuery(args.query)) {
				return {
					success: false,
					message: `Cannot search by name "${args.query}". The system only matches phone numbers or exact PPPoE/Hotspot usernames. Ask the customer for their phone number, or for the username printed on a previous bill or on the antenna sticker.`,
				};
			}
			return withIspErrorHandling(
				context,
				"isp-search-customer",
				async (config) => {
					const query = cleanPhoneNumber(args.query);
					const data = await ispGet<
						Record<string, unknown> | Record<string, unknown>[]
					>(config, "/user-info", { mobile: query });

					// API may return null (empty response), a single object, or an array
					if (!data) {
						return {
							success: false,
							message: `No customer found for "${args.query}".`,
						};
					}

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
						const connectionType = detectConnectionType(first);
						let peerUsers: { userName: string; online: boolean }[] =
							[];

						if (needsMikrotikPeers(first)) {
							// Fiber/wired: fetch from mikrotik API
							const iface = first["mikrotikInterface"] as string;
							try {
								const mikrotikData = await ispGet<
									{ userName: string; online: boolean }[]
								>(config, "/mikrotik-user-list", {
									mikrotikInterface: iface,
								});
								if (Array.isArray(mikrotikData)) {
									peerUsers = mikrotikData.filter(
										(u) => u.userName !== first["userName"],
									);
								}
							} catch {
								// Non-fatal — peer data is supplementary
							}
						} else {
							// Wireless: use accessPointUsers from search result
							const apUsers = first["accessPointUsers"] as
								| { userName: string; online: boolean }[]
								| undefined;
							if (Array.isArray(apUsers)) {
								peerUsers = apUsers.filter(
									(u) => u.userName !== first["userName"],
								);
							}
						}

						const onlineCount = peerUsers.filter(
							(u) => u.online,
						).length;
						const offlineCount = peerUsers.length - onlineCount;
						const peerSummary =
							peerUsers.length === 0
								? "No other users on this connection (dedicated)"
								: `${peerUsers.length} peers: ${onlineCount} online, ${offlineCount} offline`;

						// Strip wireless-only fields for fiber/wired customers (they're null/irrelevant noise)
						if (connectionType !== "wireless") {
							for (const key of [
								"accessPointOnline",
								"accessPointName",
								"accessPointBoardName",
								"accessPointIpAddress",
								"accessPointUpTime",
								"accessPointSignal",
								"accessPointInterfaceStats",
								"accessPointUsers",
								"stationOnline",
								"stationName",
								"stationIpAddress",
								"stationUpTime",
								"stationInterfaceStats",
							]) {
								delete first[key];
							}
						}

						return {
							success: true,
							message: `Found customer "${first["userName"] ?? args.query}".`,
							connectionType,
							peerUsers,
							peerSummary,
							customer: first,
						};
					}

					// Only return identifying fields — no diagnostic data.
					// This forces the model to call isp-search-customer again
					// with the specific userName to get fupMode, online, etc.
					const identifyOnly = filtered.map((c) => ({
						userName: c["userName"],
						firstName: c["firstName"],
						lastName: c["lastName"],
						address: c["address"],
					}));

					return {
						success: true,
						multipleMatches: true,
						message: `Found ${filtered.length} customers matching "${args.query}". Present ALL accounts with their userName (PPPoE/Hotspot login) and address (if available) so the customer can identify theirs. Do NOT show the plan/subscription name. When the customer picks one, you MUST call isp-search-customer again with the exact "userName" value to retrieve their account details — diagnostic data is not included in multi-match results.`,
						customers: identifyOnly,
					};
				},
			);
		},
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
