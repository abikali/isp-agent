import { tool } from "ai";
import { z } from "zod";
import type { BandwidthDataPoint } from "./isp-bandwidth-stats";
import type { ParsedPingResult } from "./isp-ping-customer";
import { parsePingOutput } from "./isp-ping-customer";
import {
	detectConnectionType,
	filterCustomerData,
	needsMikrotikPeers,
} from "./isp-search-customer";
import {
	cleanPhoneNumber,
	getIspApiConfigFields,
	ispGet,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

const SPEED_TEST_URL = "https://speedtest.libancomlb.com/";

// ---------------------------------------------------------------------------
// Analysis helpers (pure, deterministic — exported for testing)
// ---------------------------------------------------------------------------

export function analyzePing(parsed: ParsedPingResult | null): string {
	if (!parsed) {
		return "No ping data";
	}
	if (parsed.packetLossPercent === 100) {
		return "Unreachable (100% packet loss)";
	}
	if (parsed.packetLossPercent === 0) {
		const avg = parsed.rttAvg ?? 0;
		if (avg <= 20) {
			return "Healthy (0% loss, low latency)";
		}
		if (avg <= 50) {
			return "Healthy (0% loss, moderate latency)";
		}
		return "Healthy (0% loss, high latency)";
	}
	return `Unstable (${parsed.packetLossPercent}% packet loss)`;
}

export function analyzeBandwidth(
	stats: BandwidthDataPoint[] | null,
): string | null {
	if (!stats || stats.length === 0) {
		return null;
	}

	const latest = stats[stats.length - 1];
	if (!latest) {
		return null;
	}

	const percentDown =
		latest.limitDown > 0
			? Math.round((latest.currentDown / latest.limitDown) * 100)
			: 0;

	if (percentDown >= 80) {
		return `Saturated (${percentDown}% of plan limit in use)`;
	}
	return `Idle (${percentDown}% current usage — inconclusive)`;
}

export function interpretSignal(dbm: number): string {
	if (dbm >= -60) {
		return `${dbm} dBm (excellent)`;
	}
	if (dbm >= -70) {
		return `${dbm} dBm (good)`;
	}
	if (dbm >= -80) {
		return `${dbm} dBm (fair)`;
	}
	return `${dbm} dBm (poor)`;
}

interface DiagnosisInput {
	accountStatus: string;
	accountActive: boolean;
	online: boolean;
	fupMode: string;
	accessPointOnline: boolean | null;
	stationOnline: boolean | null;
	connectionType: "wireless" | "fiber" | "wired";
	customerPing: string;
	bandwidth: string | null;
	neighborResults: Array<{ userName: string; ping: string }>;
	signalStrength: string | null;
}

interface DiagnosisOutput {
	diagnosis: string;
	actionNeeded: string;
}

export function buildDiagnosis(input: DiagnosisInput): DiagnosisOutput {
	// Account gate failures
	if (input.accountStatus === "BLOCKED") {
		return {
			diagnosis: "Account is blocked — usually due to an unpaid balance.",
			actionNeeded:
				"Contact your ISP to resolve the block on your account.",
		};
	}
	if (input.accountStatus === "EXPIRED") {
		return {
			diagnosis: "Account subscription has expired.",
			actionNeeded: "Renew your subscription to restore service.",
		};
	}
	if (input.accountStatus === "DISABLED") {
		return {
			diagnosis: "Account is disabled.",
			actionNeeded: "Contact your ISP to reactivate your account.",
		};
	}

	// FUP while online — simple case
	if (input.online && input.fupMode === "1") {
		return {
			diagnosis:
				"Connection is active but speed is reduced due to Fair Usage Policy (data quota exceeded).",
			actionNeeded:
				"Wait for the quota to reset, or contact your ISP about upgrading your plan.",
		};
	}

	// Offline scenarios
	if (!input.online) {
		const issues: string[] = ["Customer is disconnected."];

		if (input.accessPointOnline === false) {
			issues.push(
				"The access point / antenna appears to be powered off.",
			);
		}
		if (input.stationOnline === false) {
			issues.push("The station serving this customer is down.");
		}

		// Check if neighbors are also down
		const allNeighborsUnreachable =
			input.neighborResults.length > 0 &&
			input.neighborResults.every((n) => n.ping.includes("Unreachable"));

		if (allNeighborsUnreachable && input.neighborResults.length > 0) {
			issues.push(
				"Neighboring customers are also unreachable — likely an infrastructure issue.",
			);
		} else if (
			input.neighborResults.length > 0 &&
			input.neighborResults.every(
				(n) =>
					n.ping.includes("Healthy") || n.ping.includes("Unstable"),
			)
		) {
			issues.push(
				"Neighboring customers are reachable — issue appears isolated to this customer.",
			);
		}

		if (input.fupMode === "1") {
			issues.push(
				"Note: FUP is also active but is NOT the cause of the disconnection.",
			);
		}

		const action =
			input.accessPointOnline === false
				? "Check that your equipment (antenna/router) is plugged in and powered on. If it is, contact your ISP for further help."
				: input.stationOnline === false
					? "There appears to be an infrastructure issue. Your ISP is likely already aware. If not, contact them."
					: "Try restarting your router/equipment. If the issue persists, contact your ISP.";

		return {
			diagnosis: issues.join(" "),
			actionNeeded: action,
		};
	}

	// Online but possibly having issues
	const issues: string[] = ["Customer is online."];

	if (input.customerPing.includes("Unstable")) {
		issues.push("Connection is unstable with packet loss.");
	}

	if (input.bandwidth?.includes("Saturated")) {
		issues.push(
			"Bandwidth is saturated — something on the network is consuming most of the capacity.",
		);
		return {
			diagnosis: issues.join(" "),
			actionNeeded:
				"Check for devices or applications using heavy bandwidth (updates, streaming, downloads). Disconnect other devices and retest.",
		};
	}

	if (input.customerPing.includes("Unreachable")) {
		issues.push(
			"Device is unreachable via ping — may be behind NAT/firewall, but connection is active.",
		);
	}

	if (
		input.customerPing.includes("Healthy") &&
		!input.bandwidth?.includes("Saturated")
	) {
		return {
			diagnosis:
				"Connection appears healthy. Ping is good and bandwidth is not saturated.",
			actionNeeded:
				"Run a speed test to verify actual throughput. If the result is lower than expected, contact your ISP with the screenshot.",
		};
	}

	return {
		diagnosis: issues.join(" "),
		actionNeeded:
			"Run a speed test to verify actual throughput and share the result.",
	};
}

// ---------------------------------------------------------------------------
// Peer selection
// ---------------------------------------------------------------------------

function pickRandomPeers(
	peers: Array<{ userName: string; online: boolean }>,
	max: number,
): Array<{ userName: string; online: boolean }> {
	const onlinePeers = peers.filter((p) => p.online);
	if (onlinePeers.length <= max) {
		return onlinePeers;
	}
	// Pick `max` random unique indices
	const picked: Array<{ userName: string; online: boolean }> = [];
	const used = new Set<number>();
	while (picked.length < max) {
		const idx = Math.floor(Math.random() * onlinePeers.length);
		if (!used.has(idx)) {
			used.add(idx);
			const peer = onlinePeers[idx];
			if (peer) {
				picked.push(peer);
			}
		}
	}
	return picked;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

function createIspDiagnoseCustomerTool(context: ToolContext) {
	return tool({
		description:
			"Run a full diagnostic on an ISP customer: searches their account, checks status, pings them, " +
			"checks bandwidth, and pings neighbors. Returns a pre-analyzed diagnostic report. " +
			"Use this as the FIRST tool when a customer reports any connectivity issue.",
		inputSchema: z.object({
			query: z.string().describe("Customer phone number or ISP username"),
		}),
		execute: async (args) => {
			return withIspErrorHandling(
				context,
				"isp-diagnose-customer",
				async (config) => {
					const query = cleanPhoneNumber(args.query);

					// -------------------------------------------------------
					// 1. SEARCH
					// -------------------------------------------------------
					const data = await ispGet<
						Record<string, unknown> | Record<string, unknown>[]
					>(config, "/user-info", { mobile: query });

					if (!data) {
						return {
							found: false,
							message: `No customer found for "${args.query}".`,
						};
					}

					const customers = Array.isArray(data) ? data : [data];
					if (customers.length === 0) {
						return {
							found: false,
							message: `No customer found for "${args.query}".`,
						};
					}

					const filtered = customers.map(filterCustomerData);

					// Multiple matches — return for disambiguation
					if (filtered.length > 1) {
						const identifyOnly = filtered.map((c) => ({
							userName: c["userName"],
							firstName: c["firstName"],
							lastName: c["lastName"],
							address: c["address"],
						}));
						return {
							found: true,
							multipleMatches: true,
							message: `Found ${filtered.length} customers matching "${args.query}". Present each with userName and address so the customer can identify theirs. When they pick one, call isp-diagnose-customer again with the exact userName.`,
							customers: identifyOnly,
						};
					}

					const [customer] = filtered;
					if (!customer) {
						return {
							found: false,
							message: `No customer found for "${args.query}".`,
						};
					}
					const connectionType = detectConnectionType(customer);

					// Fetch peers
					let peerUsers: { userName: string; online: boolean }[] = [];
					if (needsMikrotikPeers(customer)) {
						const iface = customer["mikrotikInterface"] as string;
						try {
							const mikrotikData = await ispGet<
								{ userName: string; online: boolean }[]
							>(config, "/mikrotik-user-list", {
								mikrotikInterface: iface,
							});
							if (Array.isArray(mikrotikData)) {
								peerUsers = mikrotikData.filter(
									(u) => u.userName !== customer["userName"],
								);
							}
						} catch {
							// Non-fatal
						}
					} else {
						const apUsers = customer["accessPointUsers"] as
							| { userName: string; online: boolean }[]
							| undefined;
						if (Array.isArray(apUsers)) {
							peerUsers = apUsers.filter(
								(u) => u.userName !== customer["userName"],
							);
						}
					}

					const onlineCount = peerUsers.filter(
						(u) => u.online,
					).length;
					const offlineCount = peerUsers.length - onlineCount;
					const peersSummary =
						peerUsers.length === 0
							? "No other users on this connection (dedicated)"
							: `${peerUsers.length} peers: ${onlineCount} online, ${offlineCount} offline`;

					const customerName = [
						customer["firstName"],
						customer["lastName"],
					]
						.filter(Boolean)
						.join(" ");
					const userName = (customer["userName"] as string) ?? query;

					// -------------------------------------------------------
					// 2. ACCOUNT GATE
					// -------------------------------------------------------
					const active = customer["active"] as boolean | undefined;
					const blocked = customer["blocked"] as boolean | undefined;
					const expiryAccount = customer["expiryAccount"] as
						| string
						| undefined;

					let accountStatus = "Active";
					let accountActive = true;

					if (active === false) {
						accountStatus = "DISABLED";
						accountActive = false;
					} else if (blocked === true) {
						accountStatus = "BLOCKED";
						accountActive = false;
					} else if (expiryAccount) {
						const expiry = new Date(expiryAccount);
						if (expiry < new Date()) {
							accountStatus = "EXPIRED";
							accountActive = false;
						}
					}

					if (!accountActive) {
						return {
							found: true,
							customerName,
							userName,
							connectionType,
							accountStatus,
							accountActive: false,
							peersSummary,
							...buildDiagnosis({
								accountStatus,
								accountActive: false,
								online: false,
								fupMode: "0",
								accessPointOnline: null,
								stationOnline: null,
								connectionType,
								customerPing: "N/A",
								bandwidth: null,
								neighborResults: [],
								signalStrength: null,
							}),
						};
					}

					// -------------------------------------------------------
					// 3. STATUS CHECK
					// -------------------------------------------------------
					const online =
						(customer["online"] as boolean | undefined) ?? false;
					const fupMode =
						(customer["fupMode"] as string | undefined) ?? "0";
					const accessPointOnline =
						(customer["accessPointOnline"] as
							| boolean
							| undefined) ?? null;
					const stationOnline =
						(customer["stationOnline"] as boolean | undefined) ??
						null;

					// Signal strength for wireless
					let signalStrength: string | null = null;
					if (connectionType === "wireless") {
						const signal = customer["accessPointSignal"] as
							| number
							| string
							| undefined;
						if (signal != null) {
							const dbm =
								typeof signal === "number"
									? signal
									: Number.parseInt(String(signal), 10);
							if (!Number.isNaN(dbm)) {
								signalStrength = interpretSignal(dbm);
							}
						}
					}

					// FUP while online — early return (skip bandwidth/ping)
					if (online && fupMode === "1") {
						const diagResult = buildDiagnosis({
							accountStatus,
							accountActive: true,
							online: true,
							fupMode: "1",
							accessPointOnline,
							stationOnline,
							connectionType,
							customerPing: "N/A",
							bandwidth: null,
							neighborResults: [],
							signalStrength,
						});

						return {
							found: true,
							customerName,
							userName,
							connectionType,
							accountStatus,
							accountActive: true,
							connectionStatus: "Online",
							fup: {
								active: true,
								description:
									"Speed reduced due to Fair Usage Policy (data quota exceeded)",
							},
							customerPing: "Skipped (FUP is the diagnosis)",
							bandwidth: null,
							neighborCheck: "Skipped (FUP is the diagnosis)",
							signalStrength,
							peersSummary,
							...diagResult,
						};
					}

					// -------------------------------------------------------
					// 4. PARALLEL DIAGNOSTICS
					// -------------------------------------------------------
					const selectedPeers = pickRandomPeers(peerUsers, 2);

					const [pingResult, bandwidthResult, ...peerPingResults] =
						await Promise.allSettled([
							// Always ping customer
							ispGet<unknown>(config, "/user-ping", {
								mobile: userName,
							}).then(parsePingOutput),
							// Bandwidth only if online
							online
								? ispGet<BandwidthDataPoint[]>(
										config,
										"/user-stat",
										{ mobile: userName },
									)
								: Promise.resolve(null),
							// Ping selected peers
							...selectedPeers.map((peer) =>
								ispGet<unknown>(config, "/user-ping", {
									mobile: peer.userName,
								})
									.then(parsePingOutput)
									.then((parsed) => ({
										userName: peer.userName,
										parsed,
									})),
							),
						]);

					// -------------------------------------------------------
					// 5. ANALYZE & BUILD REPORT
					// -------------------------------------------------------
					const parsedPing =
						pingResult.status === "fulfilled"
							? pingResult.value
							: null;
					const customerPingAnalysis = analyzePing(parsedPing);

					const bandwidthData =
						bandwidthResult.status === "fulfilled"
							? bandwidthResult.value
							: null;
					const bandwidthAnalysis = online
						? analyzeBandwidth(
								Array.isArray(bandwidthData)
									? bandwidthData
									: null,
							)
						: null;

					const neighborResults: Array<{
						userName: string;
						ping: string;
					}> = [];
					for (const result of peerPingResults) {
						if (result.status === "fulfilled") {
							const val = result.value as {
								userName: string;
								parsed: ParsedPingResult | null;
							};
							neighborResults.push({
								userName: val.userName,
								ping: analyzePing(val.parsed),
							});
						}
					}

					const neighborCheck =
						neighborResults.length === 0
							? selectedPeers.length === 0
								? "No online peers available for cross-check"
								: "Peer pings failed"
							: `Pinged ${neighborResults.map((n) => `${n.userName} (${n.ping})`).join(", ")}`;

					const connectionStatus = online
						? "Online"
						: accessPointOnline === false
							? "Offline — equipment appears powered off"
							: stationOnline === false
								? "Offline — station is down"
								: "Offline";

					const diagResult = buildDiagnosis({
						accountStatus,
						accountActive: true,
						online,
						fupMode,
						accessPointOnline,
						stationOnline,
						connectionType,
						customerPing: customerPingAnalysis,
						bandwidth: bandwidthAnalysis,
						neighborResults,
						signalStrength,
					});

					// Include speed test URL when relevant
					const shouldIncludeSpeedTest =
						online &&
						fupMode !== "1" &&
						!bandwidthAnalysis?.includes("Saturated");

					return {
						found: true,
						customerName,
						userName,
						connectionType,
						accountStatus,
						accountActive: true,
						connectionStatus,
						fup:
							fupMode === "1"
								? {
										active: true,
										description:
											"Speed reduced due to Fair Usage Policy",
									}
								: { active: false },
						customerPing: customerPingAnalysis,
						bandwidth: bandwidthAnalysis,
						neighborCheck,
						signalStrength,
						peersSummary,
						...diagResult,
						...(shouldIncludeSpeedTest
							? { speedTestUrl: SPEED_TEST_URL }
							: {}),
					};
				},
			);
		},
	});
}

export const ispDiagnoseCustomer: RegisteredTool = {
	metadata: {
		id: "isp-diagnose-customer",
		name: "ISP Diagnose Customer",
		description:
			"Full diagnostic: search + account check + ping + bandwidth + neighbor cross-check in one call",
		category: "isp",
		requiresConfig: true,
		configFields: getIspApiConfigFields(),
	},
	factory: createIspDiagnoseCustomerTool,
	defaultPromptSection: `## Diagnostic Report Guide

When isp-diagnose-customer returns a report:
- Lead with the diagnosis field — this is the main finding.
- Suggest the action from actionNeeded.
- If speedTestUrl is included, send it on its own line.
- For wireless customers, mention signal quality if relevant.
- Do NOT show raw technical numbers — the report uses plain language.
- If fup.active is true, explain speed is reduced due to data usage.

The tool runs ALL diagnostics automatically. Do NOT manually re-run individual tools unless the customer asks for a specific follow-up.

## Speed Test

When the report shows the customer is online but bandwidth is idle or zero (inconclusive), or the customer insists internet is slow despite a healthy-looking report, ask them to run a speed test. Send the link on its own line:
https://speedtest.libancomlb.com/
Then tell them to press the Start button, wait for the test to finish, and send you a screenshot of the results.

Do NOT send the speed test link when:
- The customer is offline (they can't reach it)
- FUP is active (speed reduction is expected, no test needed)
- Bandwidth is saturated (the diagnosis is already clear)

## FUP (Fair Usage Policy)

FUP is PER-ACCOUNT — it is NOT shared across an area, building, or neighbors. Each customer's quota is independent. NEVER claim that neighbors have the same FUP issue unless you have actually diagnosed their account.

If fup.active is true:
- That is the diagnosis for slow speed. No further diagnostics needed.
- FUP resets vary by plan (daily or monthly). You cannot check when it resets. If they ask, offer to connect them with a human who can check or manually reset it.
- If they want faster speed, suggest upgrading their plan.

## Neighbor Claims

When a customer says their neighbors also have issues, READ the report fields carefully:
1. FIRST check neighborCheck — if it contains "Pinged [names]", you ALREADY have neighbor ping results from the diagnostic. Use them directly. Example: "We checked your neighbors georgeshanna2 and rabihraad — both connections are healthy."
2. THEN check peersSummary — it shows how many peers exist and how many are online (e.g. "30 peers: 29 online, 1 offline"). Use this to give context.
3. ONLY if peersSummary says "dedicated" or "No other users" should you tell the customer their connection has no shared peers and suggest neighbors contact support separately.
- NEVER say the connection is dedicated when peersSummary shows peers exist.
- NEVER fabricate neighbor status. Only report what the data shows.

## Customer Not Found

When { found: false }:
1. Ask if registered under a different phone number or username.
2. If they don't know their username, ask them to send a photo of a previous invoice — you can read the image and extract the username from it.
3. If a follow-up search still returns no match, they are a NEW potential subscriber — escalate via escalate-telegram with priority "medium", including their name, phone, and a summary.
4. Tell the customer their info was forwarded — do NOT ask them to call or visit.

## Multiple Account Matches

When { multipleMatches: true }:
1. Present each account with userName and address (NOT plan name).
2. When the customer picks one, call isp-diagnose-customer again with the exact userName.`,
};
