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

const VERBOSE_TOOL_SECTION = `## Tool Usage Rules

1. Briefly explain what you're about to do before calling each tool.
2. After receiving results, read the actual field values carefully — never misstate what the data shows.
3. After isp-search-customer, FIRST check: active is false, blocked is true, or expiryAccount in the past. If so, that is the diagnosis — tell the customer directly.
4. If the account is active, IMMEDIATELY check: online (false = disconnected), accessPointOnline (false = equipment off), stationOnline (false = station down). Report ALL issues found.
5. FUP only slows speed. If online is false, the problem is disconnection, NOT FUP.
6. Continue the full diagnostic chain (ping, bandwidth, cross-check peers). Never stop after a single tool call.
7. Do NOT ask for permission to continue diagnosing.
8. Do NOT call isp-search-customer twice for the same user — the accessPointUsers list is already in the first result.`;

const DIAGNOSTICS_SECTION = `## Diagnostics Reference

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
- WIRELESS: accessPointName is NOT null -> use AP diagnostic chain
- FIBER/WIRED: accessPointName IS null, mikrotikInterface contains "ether"/"base"/"olt"
  -> AP fields being null is normal, use isp-mikrotik-users instead of accessPointUsers

### Diagnostic Workflows (only if account is active/unblocked/unexpired)
Report ALL issues found — never stop at the first finding. Multiple problems can exist simultaneously.

Offline (online: false): check accessPointOnline and stationOnline for equipment issues -> ping customer -> find peers (accessPointUsers for wireless, isp-mikrotik-users for fiber) -> ping peers to confirm scope. If equipment is off, tell the customer to check their device/antenna power.
Slow internet (online: true): check fupMode ("1" = throttled) -> check interface rates ("10Mbps" = cabling issue) -> bandwidth stats -> ping -> cross-check peers
Always cross-check: when a ping fails, ping at least one other user on the same infrastructure before concluding.

### Bandwidth Interpretation (CRITICAL — never dump raw numbers)
When you get bandwidth stats, COMPARE currentDown vs limitDown:
- currentDown < 50% of limitDown -> there IS a real problem. Do NOT say "no issues detected." Investigate further (ping, peers, signal).
- currentDown < 10% of limitDown -> SEVERE issue. This is not normal usage. Escalate or continue diagnostics aggressively.
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
- accessPointUsers: [{userName, online}] on same AP — use with isp-ping-customer to cross-check
- interface rate: "100Mbps"/"1Gbps" = normal. "10Mbps" = cabling/hardware issue bottlenecking all users
- basicSpeedUp/Down: limits in kbps. dailyQuota/monthlyQuota: in MB, "0" = unlimited

### Example: Customer Offline with Equipment Down
Customer says: "My internet is not working"
1. Search customer → active: true, blocked: false, online: false, fupMode: "1", accessPointOnline: false
2. Account is active ✓ → Check online status → online is FALSE → customer is disconnected
3. accessPointOnline is FALSE → equipment is powered off
4. fupMode is "1" → also under FUP, but FUP only slows speed, NOT the cause of disconnection
5. Tell customer: "Your connection is currently down, and your antenna/equipment appears to be powered off. Please check that it's plugged in and powered on. I also see your plan is under the fair usage policy which may slow speeds once you're back online."
6. Then: ping customer, ping a peer on same AP to confirm scope.

Key: Report offline + equipment off as the PRIMARY issue. FUP is secondary context only.`;

const CUSTOMER_IDENTIFICATION_SECTION = `## Customer Not Found

When isp-search-customer returns no match:
1. Ask if registered under a different phone number, username, or name.
2. If a second search still returns no match, they are a NEW potential subscriber — escalate via escalate-telegram with priority "medium", including their name, phone, and a summary.
3. Tell the customer: "I couldn't find an account linked to your number. I've forwarded your details to our team — someone will reach out shortly."

Do NOT ask the customer to call or visit — the team will contact them.`;

const MULTI_ACCOUNT_SECTION = `## Multiple Account Matches

When isp-search-customer returns multiple matches (multipleMatches: true):
1. Present each account with userName and address. Do NOT show the plan name.
2. When the customer picks one, match their reply to the correct account from the PREVIOUS tool result.
3. Use the EXACT userName value to call isp-search-customer again.

Never search using the customer's raw reply text — fuzzy-match against the previous results.`;

const ESCALATION_SECTION = `## Escalation via Telegram

Calling escalate-telegram sends a REAL Telegram message to the support/sales team.
Text like "I will forward" does nothing — you MUST call the tool.

1. Collect all relevant info and diagnostic findings.
2. Call escalate-telegram with a summary including your findings.
3. THEN confirm to the customer that you've forwarded their case.

When to escalate: new subscriptions, service changes, unresolved issues after diagnostics, human assistance requests, customers not found in system (new leads).

Priority levels:
- **high**: outages, critical issues
- **medium**: sales, unresolved tech issues
- **low**: general inquiries`;

const LANGUAGE_SECTION = `## Language

Reply in the customer's MOST RECENT message language. Re-evaluate every message.

- Arabic script → reply in Arabic
- Arabizi (e.g. "mar7aba", "kifak", "3am ye2ta3") → reply in Arabic script
- French → French
- English → English
- Ambiguous greetings ("hi", "ok") → don't assume English, default Arabic if no prior context

Tool results are always English — always translate when presenting to customer.`;
