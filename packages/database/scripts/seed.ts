/**
 * Seed script: Creates test users, organization, and a fully configured AI agent.
 *
 * Creates:
 * - test@example.com / TestPassword123! (Admin, verified, onboarding complete)
 * - test2@example.com / TestPassword123! (Member, verified, onboarding complete)
 * - Organization: "LibanCom" (slug: libancom), test user as owner
 * - AI Agent: "LibanCom Support" with all 12 tools enabled
 *
 * Usage: pnpm --filter @repo/database seed
 */

import { randomBytes, scryptSync } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";

/**
 * Hash a password using the same scrypt format as Better Auth.
 * Format: `<hex-salt>:<hex-derived-key>`
 */
function hashPassword(password: string): string {
	const salt = randomBytes(16).toString("hex");
	const key = scryptSync(password.normalize("NFKC"), salt, 64, {
		N: 16384,
		r: 16,
		p: 1,
		maxmem: 128 * 16384 * 16 * 2,
	});
	return `${salt}:${key.toString("hex")}`;
}

const TEST_PASSWORD = "TestPassword123!";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

const ALL_TOOL_IDS = [
	"ping-host",
	"port-scan",
	"traceroute",
	"dns-lookup",
	"email-check",
	"speed-test",
	"isp-search-customer",
	"isp-bandwidth-stats",
	"isp-mikrotik-users",
	"isp-ping-customer",
	"isp-ping-ip",
	"escalate-telegram",
];

const ISP_TOOL_IDS = [
	"isp-search-customer",
	"isp-bandwidth-stats",
	"isp-mikrotik-users",
	"isp-ping-customer",
	"isp-ping-ip",
];

const SYSTEM_PROMPT = `You are LibanCom Support, the AI assistant for LibanCom — a wireless and fiber internet service provider.

Your role:
- Diagnose connectivity issues using the available ISP tools
- Look up customer accounts and network status
- Perform network diagnostics (ping, traceroute, DNS, bandwidth)
- Escalate unresolved issues or sales leads to the team via Telegram
- Be professional, concise, and helpful

When a customer contacts you:
1. Greet them and ask how you can help
2. Search for their account when they provide a phone number or username
3. Run the full diagnostic chain — never stop after one tool call
4. Report findings in simple, non-technical language
5. Escalate to the team if the issue requires human intervention`;

async function main() {
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		logError("DATABASE_URL is not set");
		process.exit(1);
	}

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		log("🌱 Seeding database...\n");

		// --- Users ---
		const passwordHash = hashPassword(TEST_PASSWORD);
		const now = new Date();

		const user1Id = createId();
		const user2Id = createId();

		// Upsert user 1
		await client.query(
			`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", "onboardingComplete", role)
			 VALUES ($1, $2, $3, true, $4, $4, true, 'admin')
			 ON CONFLICT (email) DO UPDATE SET
				"emailVerified" = true,
				"onboardingComplete" = true,
				"updatedAt" = $4
			 RETURNING id`,
			[user1Id, "Test User", "test@example.com", now],
		);

		// Get actual user1 id (may differ if already existed)
		const u1Result = await client.query(
			`SELECT id FROM "user" WHERE email = $1`,
			["test@example.com"],
		);
		const actualUser1Id = u1Result.rows[0].id;
		log("✓ User: test@example.com");

		// Upsert user 2
		await client.query(
			`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", "onboardingComplete")
			 VALUES ($1, $2, $3, true, $4, $4, true)
			 ON CONFLICT (email) DO UPDATE SET
				"emailVerified" = true,
				"onboardingComplete" = true,
				"updatedAt" = $4
			 RETURNING id`,
			[user2Id, "Test User 2", "test2@example.com", now],
		);

		const u2Result = await client.query(
			`SELECT id FROM "user" WHERE email = $1`,
			["test2@example.com"],
		);
		const actualUser2Id = u2Result.rows[0].id;
		log("✓ User: test2@example.com");

		// Upsert account (password) for each user
		for (const [userId, email] of [
			[actualUser1Id, "test@example.com"],
			[actualUser2Id, "test2@example.com"],
		]) {
			await client.query(
				`INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
				 VALUES ($1, $2, 'credential', $3, $4, $5, $5)
				 ON CONFLICT ON CONSTRAINT account_pkey DO NOTHING`,
				[createId(), userId, userId, passwordHash, now],
			);

			// If account already exists, update password
			await client.query(
				`UPDATE account SET password = $1, "updatedAt" = $2
				 WHERE "userId" = $3 AND "providerId" = 'credential'`,
				[passwordHash, now, userId],
			);
			log(`  ✓ Account credentials for ${email}`);
		}

		// --- Organization ---
		const orgId = createId();
		await client.query(
			`INSERT INTO organization (id, name, slug, "createdAt")
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (slug) DO NOTHING`,
			[orgId, "LibanCom", "libancom", now],
		);

		const orgResult = await client.query(
			"SELECT id FROM organization WHERE slug = $1",
			["libancom"],
		);
		const actualOrgId = orgResult.rows[0].id;
		log("✓ Organization: LibanCom (libancom)");

		// Memberships
		for (const [userId, role, label] of [
			[actualUser1Id, "owner", "test@example.com as owner"],
			[actualUser2Id, "member", "test2@example.com as member"],
		]) {
			const existingMember = await client.query(
				`SELECT id FROM member WHERE "organizationId" = $1 AND "userId" = $2`,
				[actualOrgId, userId],
			);
			if (existingMember.rows.length === 0) {
				await client.query(
					`INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
					 VALUES ($1, $2, $3, $4, $5)`,
					[createId(), actualOrgId, userId, role, now],
				);
			}
			log(`  ✓ Member: ${label}`);
		}

		// --- AI Agent ---
		const existingAgent = await client.query(
			`SELECT id FROM ai_agent WHERE "organizationId" = $1 AND name = $2`,
			[actualOrgId, "LibanCom Support"],
		);

		let agentId: string;
		const webChatToken = randomBytes(32).toString("hex");

		if (existingAgent.rows.length > 0) {
			agentId = existingAgent.rows[0].id;
			await client.query(
				`UPDATE ai_agent SET
					"systemPrompt" = $1,
					model = 'claude-sonnet',
					temperature = 0.3,
					"maxHistoryLength" = 30,
					"enabledTools" = $2,
					"promptSections" = '[]'::jsonb,
					"webChatEnabled" = true,
					"webChatToken" = COALESCE("webChatToken", $3),
					enabled = true,
					"updatedAt" = $4
				 WHERE id = $5`,
				[SYSTEM_PROMPT, ALL_TOOL_IDS, webChatToken, now, agentId],
			);
			log("✓ AI Agent: LibanCom Support (updated)");
		} else {
			agentId = createId();
			await client.query(
				`INSERT INTO ai_agent (
					id, "organizationId", name, "systemPrompt", model, temperature,
					"maxHistoryLength", "enabledTools", "promptSections",
					"webChatEnabled", "webChatToken", enabled, "createdById",
					"createdAt", "updatedAt"
				 ) VALUES ($1, $2, $3, $4, 'claude-sonnet', 0.3, 30, $5, '[]'::jsonb, true, $6, true, $7, $8, $8)`,
				[
					agentId,
					actualOrgId,
					"LibanCom Support",
					SYSTEM_PROMPT,
					ALL_TOOL_IDS,
					webChatToken,
					actualUser1Id,
					now,
				],
			);
			log("✓ AI Agent: LibanCom Support (created)");
		}

		// --- Tool Configs ---
		const ispConfig = JSON.stringify({
			ispBaseUrl:
				process.env["ISP_API_BASE_URL"] ||
				"https://isp-api.example.com",
			ispUsername: process.env["ISP_API_USERNAME"] || "api-user",
			ispPassword: process.env["ISP_API_PASSWORD"] || "api-password",
		});

		const telegramConfig = JSON.stringify({
			telegramBotToken:
				process.env["TELEGRAM_BOT_TOKEN"] ||
				"0000000000:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
			telegramChatIds: (
				process.env["TELEGRAM_CHAT_IDS"] || "123456789"
			).split(","),
		});

		// ISP tool configs
		for (const toolId of ISP_TOOL_IDS) {
			await client.query(
				`INSERT INTO ai_agent_tool_config (id, "agentId", "toolId", config, "createdAt", "updatedAt")
				 VALUES ($1, $2, $3, $4::jsonb, $5, $5)
				 ON CONFLICT ("agentId", "toolId") DO UPDATE SET
					config = $4::jsonb,
					"updatedAt" = $5`,
				[createId(), agentId, toolId, ispConfig, now],
			);
		}
		log("  ✓ ISP tool configs (5 tools)");

		// isp-search-customer gets a promptSection from its defaultPromptSection
		const ispSearchPromptSection = `## Diagnostics Reference

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
NEVER present raw kbps/Mbps numbers to the customer. Translate into simple language.

### Field Reference
- online: true = connected, false = disconnected (NOT caused by FUP)
- fupMode: "0" = normal, "1" = throttled (exceeded data quota). FUP only reduces speed, never causes disconnection.
- accessPointOnline: true = AP reachable, false = AP is down/powered off
- stationOnline: true = station reachable, false = station is down
- accessPointSignal: dBm. -50 to -60 excellent, -60 to -70 good, -70 to -80 fair, below -80 poor
- accessPointUsers: [{userName, online}] on same AP — use with isp-ping-customer to cross-check
- interface rate: "100Mbps"/"1Gbps" = normal. "10Mbps" = cabling/hardware issue bottlenecking all users
- basicSpeedUp/Down: limits in kbps. dailyQuota/monthlyQuota: in MB, "0" = unlimited

## Customer Not Found

When isp-search-customer returns no match:
1. Ask if registered under a different phone number, username, or name.
2. If a second search still returns no match, they are a NEW potential subscriber — escalate via escalate-telegram with priority "medium", including their name, phone, and a summary.
3. Tell the customer: "I couldn't find an account linked to your number. I've forwarded your details to our team — someone will reach out shortly."

## Multiple Account Matches

When isp-search-customer returns multiple matches (multipleMatches: true):
1. Present each account with userName and address. Do NOT show the plan name.
2. When the customer picks one, match their reply to the correct account from the PREVIOUS tool result.
3. Use the EXACT userName value to call isp-search-customer again.`;

		await client.query(
			`UPDATE ai_agent_tool_config SET "promptSection" = $1, "updatedAt" = $2
			 WHERE "agentId" = $3 AND "toolId" = 'isp-search-customer'`,
			[ispSearchPromptSection, now, agentId],
		);
		log("  ✓ isp-search-customer promptSection");

		// Escalate telegram config
		const telegramPromptSection = `## Escalation via Telegram

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

		await client.query(
			`INSERT INTO ai_agent_tool_config (id, "agentId", "toolId", config, "promptSection", "createdAt", "updatedAt")
			 VALUES ($1, $2, 'escalate-telegram', $3::jsonb, $4, $5, $5)
			 ON CONFLICT ("agentId", "toolId") DO UPDATE SET
				config = $3::jsonb,
				"promptSection" = $4,
				"updatedAt" = $5`,
			[createId(), agentId, telegramConfig, telegramPromptSection, now],
		);
		log("  ✓ escalate-telegram config + promptSection");

		log("\n🎉 Seed complete!");
		log(`\n  Login: test@example.com / ${TEST_PASSWORD}`);
		log("  Org:   LibanCom (libancom)");
		log(`  Agent: LibanCom Support (${agentId})`);
	} catch (error) {
		logError("❌ Seed failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main().catch(logError);
