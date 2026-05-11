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
	isSearchableQuery,
	withIspErrorHandling,
} from "./lib/isp-api-client";
import type { RegisteredTool, ToolContext } from "./types";

const SPEED_TEST_URL = "https://speedtest.libancomlb.com/";

// ---------------------------------------------------------------------------
// Structured analysis types
// ---------------------------------------------------------------------------

export interface PingAnalysis {
	status: "healthy" | "unstable" | "unreachable" | "unknown";
	packetLossPercent: number;
	latency: "low" | "moderate" | "high" | null;
}

export interface BandwidthAnalysis {
	status: "saturated" | "idle" | "unknown";
	usagePercent: number;
}

export interface SignalAnalysis {
	dbm: number;
	quality: "excellent" | "good" | "fair" | "poor";
}

// ---------------------------------------------------------------------------
// Analysis helpers (pure, deterministic — exported for testing)
// ---------------------------------------------------------------------------

export function analyzePing(parsed: ParsedPingResult | null): PingAnalysis {
	if (!parsed) {
		return { status: "unknown", packetLossPercent: 0, latency: null };
	}
	if (parsed.packetLossPercent === 100) {
		return { status: "unreachable", packetLossPercent: 100, latency: null };
	}
	if (parsed.packetLossPercent === 0) {
		const avg = parsed.rttAvg ?? 0;
		const latency: PingAnalysis["latency"] =
			avg <= 20 ? "low" : avg <= 50 ? "moderate" : "high";
		return { status: "healthy", packetLossPercent: 0, latency };
	}
	return {
		status: "unstable",
		packetLossPercent: parsed.packetLossPercent,
		latency: null,
	};
}

/** Text-formatted ping analysis for neighborCheck display */
export function analyzePingText(parsed: ParsedPingResult | null): string {
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
): BandwidthAnalysis | null {
	if (!stats || stats.length === 0) {
		return null;
	}

	const latest = stats[stats.length - 1];
	if (!latest) {
		return null;
	}

	const usagePercent =
		latest.limitDown > 0
			? Math.round((latest.currentDown / latest.limitDown) * 100)
			: 0;

	if (usagePercent >= 80) {
		return { status: "saturated", usagePercent };
	}
	return { status: "idle", usagePercent };
}

export function interpretSignal(dbm: number): SignalAnalysis {
	if (dbm >= -60) {
		return { dbm, quality: "excellent" };
	}
	if (dbm >= -70) {
		return { dbm, quality: "good" };
	}
	if (dbm >= -80) {
		return { dbm, quality: "fair" };
	}
	return { dbm, quality: "poor" };
}

interface DiagnosisInput {
	accountStatus: string;
	accountActive: boolean;
	online: boolean;
	fupMode: string;
	accessPointOnline: boolean | null;
	stationOnline: boolean | null;
	connectionType: "wireless" | "fiber" | "wired";
	pingStatus: PingAnalysis["status"];
	bandwidthStatus: BandwidthAnalysis["status"] | null;
	neighborResults: Array<{ userName: string; ping: string }>;
}

interface DiagnosisOutput {
	severity: "ok" | "degraded" | "down" | "account-issue";
	diagnosis: string;
	actionNeeded: string;
}

export function buildDiagnosis(input: DiagnosisInput): DiagnosisOutput {
	// Account gate failures
	if (input.accountStatus === "BLOCKED") {
		return {
			severity: "account-issue",
			diagnosis: "Account is blocked — usually due to an unpaid balance.",
			actionNeeded:
				"Contact your ISP to resolve the block on your account.",
		};
	}
	if (input.accountStatus === "EXPIRED") {
		return {
			severity: "account-issue",
			diagnosis: "Account subscription has expired.",
			actionNeeded: "Renew your subscription to restore service.",
		};
	}
	if (input.accountStatus === "DISABLED") {
		return {
			severity: "account-issue",
			diagnosis: "Account is disabled.",
			actionNeeded: "Contact your ISP to reactivate your account.",
		};
	}

	// FUP while online — simple case
	if (input.online && input.fupMode === "1") {
		return {
			severity: "degraded",
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
			severity: "down",
			diagnosis: issues.join(" "),
			actionNeeded: action,
		};
	}

	// Online but possibly having issues
	const issues: string[] = ["Customer is online."];

	if (input.pingStatus === "unstable") {
		issues.push("Connection is unstable with packet loss.");
	}

	if (input.bandwidthStatus === "saturated") {
		issues.push(
			"Bandwidth is saturated — something on the network is consuming most of the capacity.",
		);
		return {
			severity: "degraded",
			diagnosis: issues.join(" "),
			actionNeeded:
				"Check for devices or applications using heavy bandwidth (updates, streaming, downloads). Disconnect other devices and retest.",
		};
	}

	if (input.pingStatus === "unreachable") {
		issues.push(
			"Device is unreachable via ping — may be behind NAT/firewall, but connection is active.",
		);
	}

	if (input.pingStatus === "healthy") {
		return {
			severity: "ok",
			diagnosis:
				"Connection appears healthy. Ping is good and bandwidth is not saturated.",
			actionNeeded:
				"Run a speed test to verify actual throughput. If the result is lower than expected, contact your ISP with the screenshot.",
		};
	}

	return {
		severity: "degraded",
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
			if (!isSearchableQuery(args.query)) {
				return {
					found: false,
					message: `Cannot search by name "${args.query}" — the system only matches phone numbers or exact PPPoE/Hotspot usernames, never personal names. Retry using the phone or username from your VERIFIED CUSTOMER / CUSTOMER CONTACT INFO section. Only ask the customer if neither is available there or the customer has indicated the account is under different details.`,
				};
			}
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
						const identifyOnly = filtered.map((c, i) => ({
							option: i + 1,
							userName: c["userName"],
							firstName: c["firstName"],
							lastName: c["lastName"],
							address: c["address"],
						}));
						return {
							found: true,
							multipleMatches: true,
							message: `Found ${filtered.length} accounts. You MUST list each option with its userName (e.g. "joseph1") and address. The customer needs to tell you which userName is theirs so you can diagnose the correct account.`,
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
							connectionStatus: "Offline",
							ping: {
								status: "unknown" as const,
								packetLossPercent: 0,
								latency: null,
							},
							bandwidth: null,
							signal: null,
							peersSummary,
							neighborCheck: "Skipped (account issue)",
							...buildDiagnosis({
								accountStatus,
								accountActive: false,
								online: false,
								fupMode: "0",
								accessPointOnline: null,
								stationOnline: null,
								connectionType,
								pingStatus: "unknown",
								bandwidthStatus: null,
								neighborResults: [],
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
					let signalResult: SignalAnalysis | null = null;
					if (connectionType === "wireless") {
						const signal = customer["accessPointSignal"] as
							| number
							| string
							| undefined;
						if (signal != null) {
							// Parse first number from potential "TX / RX" format (e.g. "-60 / -52")
							const signalStr = String(signal);
							const match = signalStr.match(/-?\d+/);
							const dbm =
								typeof signal === "number"
									? signal
									: match
										? Number.parseInt(match[0], 10)
										: Number.NaN;
							if (!Number.isNaN(dbm)) {
								signalResult = interpretSignal(dbm);
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
							pingStatus: "unknown",
							bandwidthStatus: null,
							neighborResults: [],
						});

						return {
							found: true,
							customerName,
							userName,
							connectionType,
							accountStatus,
							accountActive: true,
							connectionStatus: "Online",
							fupActive: true,
							fupDescription:
								"Speed reduced due to Fair Usage Policy (data quota exceeded)",
							ping: {
								status: "unknown" as const,
								packetLossPercent: 0,
								latency: null,
							},
							bandwidth: null,
							signal: signalResult,
							neighborCheck: "Skipped (FUP is the diagnosis)",
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
					const pingAnalysis = analyzePing(parsedPing);

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

					// Neighbor results use text format for human-readable neighborCheck
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
								ping: analyzePingText(val.parsed),
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
						pingStatus: pingAnalysis.status,
						bandwidthStatus: bandwidthAnalysis?.status ?? null,
						neighborResults,
					});

					// Include speed test URL when relevant
					const shouldIncludeSpeedTest =
						online &&
						fupMode !== "1" &&
						bandwidthAnalysis?.status !== "saturated";

					return {
						found: true,
						customerName,
						userName,
						connectionType,
						accountStatus,
						accountActive: true,
						connectionStatus,
						...(fupMode === "1"
							? {
									fupActive: true,
									fupDescription:
										"Speed reduced due to Fair Usage Policy",
								}
							: {}),
						ping: pingAnalysis,
						bandwidth: bandwidthAnalysis,
						signal: signalResult,
						neighborCheck,
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

Use the severity field to guide response urgency:
- "ok" → reassure the customer, suggest speed test if they still have issues
- "degraded" → explain what's degraded (FUP, bandwidth, unstable ping) and suggest actions
- "down" → prioritize getting them back online
- "account-issue" → explain the account problem and how to resolve it

The tool runs ALL diagnostics automatically. Do NOT manually re-run individual tools unless the customer asks for a specific follow-up.

Fields like fupActive, ping, bandwidth, and signal are only present when relevant — do NOT mention absent fields.

## Speed Test

When the report shows the customer is online but bandwidth is idle (inconclusive), or the customer insists internet is slow despite a healthy-looking report, ask them to run a speed test. Send the link on its own line:
https://speedtest.libancomlb.com/
Then tell them to press the Start button, wait for the test to finish, and send you a screenshot of the results.

Do NOT send the speed test link when:
- The customer is offline (they can't reach it)
- FUP is active (speed reduction is expected, no test needed)
- Bandwidth is saturated (the diagnosis is already clear)

## FUP (Fair Usage Policy)

FUP is PER-ACCOUNT — it is NOT shared across an area, building, or neighbors. Each customer's quota is independent. NEVER claim that neighbors have the same FUP issue unless you have actually diagnosed their account.

If fupActive is true:
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
1. List each account showing its userName (exactly as written, e.g. "joseph1") and address. The userName is a technical identifier — always include it verbatim.
2. Ask the customer which one is theirs.
3. When they pick one, call isp-diagnose-customer again with the exact userName.`,
};
