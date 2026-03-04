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

### Connection Type Detection
- WIRELESS: accessPointName is NOT null -> use AP diagnostic chain (accessPointUsers from the FIRST search result)
- FIBER/WIRED: accessPointName IS null, mikrotikInterface contains "ether"/"base"/"olt"
  -> AP fields being null is normal, use isp-mikrotik-users with the EXACT mikrotikInterface value from the search result
IMPORTANT: Do NOT call isp-mikrotik-users for wireless customers. Do NOT fabricate or guess interface names — always use the EXACT value from the search result.

### Diagnostic Workflows (only if account is active/unblocked/unexpired)
Stop as soon as you have a clear diagnosis. Only continue to the next step if the cause is still unclear.

Offline (online: false):
1. Check accessPointOnline and stationOnline → if equipment is off, that's the diagnosis. Tell the customer.
2. If equipment is online but customer is offline → ping customer to confirm.
3. If cause is still unclear → check accessPointUsers for peer status to determine if isolated or widespread.

Slow internet (online: true):
1. Check fupMode → if "1", that's the diagnosis. Tell the customer their speed is reduced due to FUP. Stop here.
2. If not FUP → check interface rates ("10Mbps" = cabling issue).
3. If cause is still unclear → get bandwidth stats, then check peers.

Do NOT run the full chain when the first step already answers the question.

### Peer Cross-Check (use ISP data, not ping)
The "online" field in accessPointUsers is the SOURCE OF TRUTH for whether a peer is connected. Do NOT override it with ping results.
- If accessPointUsers contains ONLY the customer themselves → there are no peers to cross-check. The customer has a dedicated AP. Do NOT say "neighbors are online" — there are no neighbors on this AP. Focus on equipment and station status instead.
- If accessPointUsers shows OTHER peers as online: true but YOUR customer is offline → the issue is ISOLATED to this customer, not infrastructure-wide.
- If accessPointUsers shows ALL peers (including others) as offline → likely infrastructure/AP issue.
- Ping timeouts do NOT mean a user is offline. Timeouts can be caused by firewalls, NAT, or routing. Never say "all users are offline" based on ping timeouts when the ISP data shows them as online.
Only ping peers as a supplementary check. Always state what the ISP data shows, not what you infer from ping.
IMPORTANT: Never claim "neighbors have internet" unless you have ACTUAL peer data from the customer's OWN access point showing other users online.

### Bandwidth Interpretation (never dump raw numbers)
When you get bandwidth stats, COMPARE currentDown vs limitDown:
- currentDown < 50% of limitDown -> there IS a real problem. Do NOT say "no issues detected." Investigate further.
- currentDown < 10% of limitDown -> SEVERE issue. Escalate or continue diagnostics.
- currentDown close to limitDown -> speed is healthy.
NEVER present raw kbps/Mbps numbers to the customer. Translate into simple language:
- Instead of "11 kbps download with 3.4 Mbps limit", say "your connection is currently running much slower than it should be."
- Tell the customer what the PROBLEM is and what ACTIONS to take, not technical measurements.
- Do NOT blame the customer's devices or usage when the data shows a clear network-side speed issue.

### Field Reference
- online: true = connected, false = disconnected (NOT caused by FUP)
- fupMode: "0" = normal, "1" = throttled (exceeded data quota). FUP only reduces speed, never causes disconnection.
- accessPointOnline: true = AP reachable, false = AP is down/powered off
- stationOnline: true = station reachable, false = station is down
- accessPointSignal: dBm. -50 to -60 excellent, -60 to -70 good, -70 to -80 fair, below -80 poor
- accessPointUsers: [{userName, online}] on same AP — the "online" field here is the authoritative connectivity status. Use it to determine if the issue is isolated or widespread. Ping is optional supplementary data only.
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
