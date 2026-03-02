export interface BuildSystemPromptOptions {
	basePrompt: string;
	enabledTools: string[];
	knowledgeBase?: string | undefined;
	contactName?: string | undefined;
	contactPhone?: string | undefined;
	maintenanceMode?: boolean | undefined;
	maintenanceMessage?: string | undefined;
	/** Provider name for contact info section (e.g. "whatsapp", "telegram") */
	provider?: string | undefined;
	/** Web chat doesn't need verbose tool narration */
	isWebChat?: boolean | undefined;
}

export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
	const sections: string[] = [opts.basePrompt];

	// Maintenance mode
	if (opts.maintenanceMode && opts.maintenanceMessage) {
		sections.push(maintenanceSection(opts.maintenanceMessage));
	}

	// Contact info (messaging channels only — web chat has no contact info)
	if (opts.contactName || opts.contactPhone) {
		sections.push(contactInfoSection(opts));
	}

	// Tool-specific behavioral instructions
	const hasTools = opts.enabledTools.length > 0;
	if (hasTools) {
		if (!opts.isWebChat) {
			sections.push(VERBOSE_TOOL_SECTION);
		}

		if (opts.enabledTools.includes("isp-search-customer")) {
			sections.push(DIAGNOSTICS_SECTION);
			sections.push(CUSTOMER_IDENTIFICATION_SECTION);
			sections.push(MULTI_ACCOUNT_SECTION);
		}

		if (opts.enabledTools.includes("escalate-telegram")) {
			sections.push(ESCALATION_SECTION);
		}
	}

	// Language — always last so it's most prominent to the model
	sections.push(LANGUAGE_SECTION);

	return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function maintenanceSection(message: string): string {
	return (
		`MAINTENANCE MODE ACTIVE: The admin has flagged a known issue. Here is their internal note (do NOT repeat it verbatim to customers): "${message}". ` +
		"If a customer reports a problem that could be related, acknowledge their concern empathetically and explain in your own words. " +
		"Do NOT parrot the admin message. If it includes an estimated time, share it; otherwise don't speculate. " +
		"If the customer asks about something unrelated, help normally."
	);
}

function contactInfoSection(opts: BuildSystemPromptOptions): string {
	const parts: string[] = [];
	if (opts.contactName) {
		parts.push(`name: ${opts.contactName}`);
	}
	if (opts.contactPhone) {
		parts.push(`phone: ${opts.contactPhone}`);
	}
	const provider = opts.provider ?? "messaging";
	return (
		`CUSTOMER CONTACT INFO (from their ${provider} account): ${parts.join(", ")}. ` +
		"You already have this — do NOT ask for it from scratch. " +
		`Confirm naturally (e.g. "I see your number is ${opts.contactPhone ?? "..."}, is that correct?"). ` +
		"Use it for account lookups, escalations, sales leads, and any situation requiring the customer's identity. " +
		"If the customer provides a DIFFERENT phone number or name, use that instead."
	);
}

// ---------------------------------------------------------------------------
// Static instruction sections
// ---------------------------------------------------------------------------

const VERBOSE_TOOL_SECTION =
	"When using tools, briefly explain what you're about to do before calling each tool. " +
	"After receiving results, read the actual field values carefully before reporting them — never misstate what the data shows. " +
	"After isp-search-customer, FIRST check if active is false, blocked is true, or expiryAccount is in the past. " +
	"If so, that is the diagnosis — tell the customer directly. " +
	"If the account is eligible, continue the full diagnostic chain (ping, bandwidth, cross-check peers). " +
	"Never stop after a single tool call. Do NOT ask for permission to continue diagnosing. " +
	"Do NOT call isp-search-customer twice for the same user — the accessPointUsers list is already in the first result.";

const DIAGNOSTICS_SECTION = `## Diagnostics Reference

### Account Status Gate (always check first)
After searching a customer, check these deal-breakers FIRST:
- active: false -> account is DISABLED, tell them, stop diagnostics
- blocked: true -> account is BLOCKED (usually billing), tell them
- expiryAccount in the past -> account EXPIRED, tell them
Read values carefully from the actual data. Never misreport them.

### Connection Type Detection
- WIRELESS: accessPointName is NOT null -> use AP diagnostic chain
- FIBER/WIRED: accessPointName IS null, mikrotikInterface contains "ether"/"base"/"olt"
  -> AP fields being null is normal, use isp-mikrotik-users instead of accessPointUsers

### Diagnostic Workflows (only if account is active/unblocked/unexpired)
Slow internet: check fupMode ("1" = throttled) -> check interface rates ("10Mbps" = cabling issue) -> bandwidth stats -> ping -> cross-check peers
Offline: ping customer -> find peers (accessPointUsers for wireless, isp-mikrotik-users for fiber) -> ping peers to confirm scope
Always cross-check: when a ping fails, ping at least one other user on the same infrastructure before concluding.

### Field Reference
- fupMode: "0" = normal, "1" = throttled (exceeded data quota)
- accessPointSignal: dBm. -50 to -60 excellent, -60 to -70 good, -70 to -80 fair, below -80 poor
- accessPointUsers: [{userName, online}] on same AP — use with isp-ping-customer to cross-check
- interface rate: "100Mbps"/"1Gbps" = normal. "10Mbps" = cabling/hardware issue bottlenecking all users
- basicSpeedUp/Down: limits in kbps. dailyQuota/monthlyQuota: in MB, "0" = unlimited`;

const CUSTOMER_IDENTIFICATION_SECTION =
	"CUSTOMER IDENTIFICATION: When isp-search-customer returns no match: " +
	"(1) Ask if registered under a different phone number, username, or name. " +
	"(2) If a second search still returns no match, they are a NEW potential subscriber — " +
	'escalate via escalate-telegram with priority "medium", including their name, phone, and a summary. ' +
	"(3) Tell the customer: \"I couldn't find an account linked to your number. I've forwarded your details to our team — someone will reach out shortly.\" " +
	"Do NOT ask the customer to call or visit — the team will contact them.";

const MULTI_ACCOUNT_SECTION =
	"MULTIPLE ACCOUNTS: When isp-search-customer returns multiple matches (multipleMatches: true), " +
	"present each account with userName and address. Do NOT show the plan name. " +
	"When the customer picks one, match their reply to the correct account from the PREVIOUS tool result " +
	"and use the EXACT userName value to call isp-search-customer again. " +
	"Never search using the customer's raw reply text — fuzzy-match against the previous results.";

const ESCALATION_SECTION =
	"ESCALATION: Calling escalate-telegram sends a REAL Telegram message to the support/sales team. " +
	'Text like "I will forward" does nothing — you MUST call the tool. ' +
	"Pattern: collect info -> call tool -> THEN confirm to the customer. " +
	"When to escalate: new subscriptions, service changes, unresolved issues after diagnostics, " +
	"human assistance requests, customers not found in system (new leads). " +
	"Priority: high = outages/critical, medium = sales/unresolved tech, low = general inquiries. " +
	"Always include your diagnostic findings in the summary.";

const LANGUAGE_SECTION =
	"LANGUAGE MATCHING: Reply in the customer's MOST RECENT message language. Re-evaluate every message.\n" +
	"- Arabic script -> reply in Arabic\n" +
	'- Arabizi (e.g. "mar7aba", "kifak", "3am ye2ta3") -> reply in Arabic script\n' +
	"- French -> French. English -> English.\n" +
	'- Ambiguous greetings ("hi", "ok") -> don\'t assume English, default Arabic if no prior context\n' +
	"- Tool results are always English — always translate when presenting to customer.";
