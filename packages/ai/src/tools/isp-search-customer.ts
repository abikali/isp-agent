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

/** Matches interfaces that need mikrotik API for peer data (fiber/wired/cable). */
const MIKROTIK_PEER_IFACE = /\bOLT\d*\b|\bether\d*\b|\bbase\d*\b/i;

function detectConnectionType(
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

function needsMikrotikPeers(customer: Record<string, unknown>): boolean {
	const iface = customer["mikrotikInterface"] as string | undefined;
	return !!iface && MIKROTIK_PEER_IFACE.test(iface);
}

const ispSearchCustomerDef = toolDefinition({
	name: "isp-search-customer",
	description:
		"Search for an ISP customer by phone number or username. Returns account status (active, blocked, expiryAccount), " +
		"connection details (fupMode, speeds, quotas), network topology (station, access point, mikrotikInterface), " +
		"and accessPointUsers (peers on the same AP for cross-checking). Does NOT return billing or personal contact info.",
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
					let peerUsers: { userName: string; online: boolean }[] = [];

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

				return {
					success: true,
					multipleMatches: true,
					message: `Found ${filtered.length} customers matching "${args.query}". Present ALL accounts with their userName (PPPoE/Hotspot login) and address (if available) so the customer can identify theirs. Do NOT show the plan/subscription name. CRITICAL: When the customer picks one, you MUST use the exact "userName" value from this result list to call isp-search-customer again — do NOT use whatever the customer typed verbatim.`,
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
	defaultPromptSection: `## Diagnostics Reference

### Account Status Gate (always check first)
After searching a customer, check these deal-breakers FIRST:
- active: false -> account is DISABLED, tell them, stop diagnostics
- blocked: true -> account is BLOCKED (usually billing), tell them
- expiryAccount in the past -> account EXPIRED, tell them
Read values carefully from the actual data. Never misreport them.

### Online & Equipment Status (check IMMEDIATELY after account gate)
After confirming the account is active/unblocked/unexpired, check these fields and report ALL issues found:
- online: false -> customer is DISCONNECTED. This is critical — always mention it.
- accessPointOnline: false (wireless customers) -> the access point / antenna is DOWN or TURNED OFF. Tell the customer their equipment appears to be off.
- stationOnline: false -> the station serving this customer is DOWN.
IMPORTANT: fupMode "1" (throttled) only SLOWS speed — it does NOT cause disconnection or offline status.
If the customer is offline (online: false), FUP is NOT the cause. Diagnose the offline issue first.

### Connection Type & Peers
The search result includes:
- connectionType: "wireless", "fiber", or "wired" (detected automatically)
- peerUsers: [{userName, online}] — other customers on the same infrastructure, excluding the searched customer
- peerSummary: human-readable summary (e.g., "5 peers: 4 online, 1 offline")

Peer data is fetched automatically by the tool. Do NOT call isp-mikrotik-users for peer checking.

Interpreting peerUsers:
- Empty (dedicated connection) → no peers to cross-check. Focus on equipment and station status.
- Other peers online but customer offline → issue is ISOLATED to this customer
- All peers offline → likely infrastructure/AP problem
- The "online" field is the SOURCE OF TRUTH. Ping timeouts do NOT mean offline (firewalls/NAT can cause them).

Never claim "neighbors have internet" unless peerUsers actually shows other users online.

### Diagnostic Workflows (only if account is active/unblocked/unexpired)

Offline (online: false):
1. Check accessPointOnline and stationOnline — report any equipment that is off.
2. Ping the customer (isp-ping-customer) to check reachability and latency.
3. Check peerUsers to determine if isolated or widespread.
4. Report all findings together: equipment status + ping result + peer status.

Slow internet (online: true):
1. Check fupMode → if "1", that's the diagnosis. Tell the customer their speed is reduced due to FUP. Stop here.
2. If not FUP → ping the customer to check latency and packet loss.
3. Check bandwidth stats and interface rates ("10Mbps" = cabling issue).
4. Report findings: ping quality + bandwidth + any issues found.

For wireless customers, always mention the signal strength (accessPointSignal) if available.

### Bandwidth Interpretation (CRITICAL — read carefully)
isp-bandwidth-stats shows CURRENT real-time usage, NOT maximum capacity or speed.
- A reading of 1% means the customer is currently USING 1% of their plan — NOT that their speed is capped at 1%.
- Low readings (below ~80%) are INCONCLUSIVE. They just mean the line is idle or lightly used right now.
- Only readings ABOVE ~80% are diagnostic: the line is saturated and something on their network is consuming most bandwidth.
- 0% usage does NOT mean the connection is broken — it means no data is flowing right now.

What to do:
- If bandwidth is above ~80% of limit -> line is saturated. Tell customer something on their network is using all the bandwidth.
- If bandwidth is below ~80% -> this tells you NOTHING about whether speed is actually slow. Ask the customer to run a speed test at http://172.20.2.225:8989/ and send a screenshot, then re-check bandwidth while they test.
- NEVER tell a customer "your speed is much lower than it should be" based on low current usage. That is a misdiagnosis.
- NEVER present raw kbps/Mbps numbers to the customer. Use simple language.
- Do NOT blame the customer's devices or usage unless bandwidth is clearly saturated (above ~80%).

### Field Reference
- online: true = connected, false = disconnected (NOT caused by FUP)
- fupMode: "0" = normal, "1" = throttled (exceeded data quota). FUP only reduces speed, never causes disconnection.
- accessPointOnline: true = AP reachable, false = AP is down/powered off
- stationOnline: true = station reachable, false = station is down
- accessPointSignal: dBm. -50 to -60 excellent, -60 to -70 good, -70 to -80 fair, below -80 poor
- peerUsers: [{userName, online}] — auto-fetched peers on the same infrastructure (AP or mikrotik interface), excluding the searched customer. The "online" field is authoritative.
- interface rate: "100Mbps"/"1Gbps" = normal. "10Mbps" = cabling/hardware issue bottlenecking all users
- basicSpeedUp/Down: limits in kbps. dailyQuota/monthlyQuota: in MB, "0" = unlimited

### Example: Customer Offline with Equipment Down
Customer says: "My internet is not working"
1. Search customer → active: true, blocked: false, online: false, fupMode: "1", accessPointOnline: false
2. Account is active ✓ → Check online status → online is FALSE → customer is disconnected
3. accessPointOnline is FALSE → equipment is powered off → that's the diagnosis
4. fupMode is "1" → mention as secondary context (FUP only slows speed, not the cause of disconnection)
5. Tell customer: "Your connection is down and your antenna/equipment appears to be powered off. Please check that it's plugged in and powered on. Once you're back online, your speed may be reduced due to fair usage policy."

Key: Report offline + equipment off as the PRIMARY issue. FUP is secondary context only.

## Customer Not Found

When isp-search-customer returns no match:
1. Ask if registered under a different phone number or username.
2. If they don't know their username, ask them to send a photo of a previous invoice — you can read the image and extract the username from it.
3. If a follow-up search still returns no match, they are a NEW potential subscriber — escalate via escalate-telegram with priority "medium", including their name, phone, and a summary.
4. Tell the customer: "I couldn't find an account linked to your details. I've forwarded your info to our team — someone will reach out shortly."

Do NOT ask the customer to call or visit — the team will contact them.

## Multiple Account Matches

When isp-search-customer returns multiple matches (multipleMatches: true):
1. Present each account with userName and address. Do NOT show the plan name.
2. When the customer picks one, match their reply to the correct account from the PREVIOUS tool result.
3. Use the EXACT userName value to call isp-search-customer again.

Never search using the customer's raw reply text — fuzzy-match against the previous results.`,
};
