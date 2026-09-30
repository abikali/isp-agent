/**
 * One-off: edit the stored system prompt of the LibanCom WhatsApp agent so it
 * reads speed tests correctly and never quotes a catalog plan as the
 * subscriber's own (spec A4, Jhonny 26 Sep batch).
 *
 * Edits `ai_agent."systemPrompt"` (the prod copy; the code defaults only seed
 * new agents):
 *   1. Replace the whole "## Speed Test" block with the on-net reading guide
 *      (same text as the isp-diagnose-customer tool section in code).
 *   2. "## Sales": add the "own plan and price come ONLY from the plan field"
 *      bullet after "Present available plans from the SERVICE PLANS data…".
 *   3. "## Boundaries": add the speed-test bullet after "Every claim about a
 *      customer's account must come from a tool result…".
 *
 * `promptSections` needs no change. Idempotent: an edit whose text is already
 * present is skipped. A missing anchor is reported and that edit skipped.
 *
 * Optional `--include-dotnet` applies the same three edits to the dotnet agent
 * (ccae505755fcafe52d37d4aff, uppercase "SPEED TEST:" style prompt).
 *
 * Dry run by default (prints before/after of each changed block); --apply writes.
 * Usage (DATABASE_URL set):
 *   pnpm dlx tsx packages/database/scripts/jhonny26/ai-prompt-edits.ts [--include-dotnet] [--apply]
 */

// @ts-expect-error -- pg has types via @types/pg but they don't cover the ESM export
import pg from "pg";

// biome-ignore lint/suspicious/noConsole: CLI script
const log = console.log.bind(console);
// biome-ignore lint/suspicious/noConsole: CLI script
const logError = console.error.bind(console);

const LIBANCOM_AGENT_ID = "cmlci39ed0000ags5jge558ci";
const DOTNET_AGENT_ID = "ccae505755fcafe52d37d4aff";

const SPEED_TEST_BODY = `When the report shows the customer online but bandwidth idle (inconclusive), or the customer insists it is slow despite a healthy report, ask them to run a speed test. Send the link on its own line:
https://speedtest.libancomlb.com/
Tell them to press Start, wait for it to finish, and send a screenshot. Skip it when the customer is offline, FUP is active, or bandwidth is saturated.

Reading the result — this test runs on a server INSIDE our network. It measures the customer's device, Wi-Fi and router up to us; it is NOT capped by their plan and it is NOT their internet speed.
- On a healthy line the result should be far above the plan speed (roughly 80–90 Mbps on wireless links and up to ~300 Mbps on fiber, when the device is close to the router or on a cable).
- A result near or below the plan speed means the bottleneck is on the customer's side: the router, the Wi-Fi (distance, walls, 2.4 GHz band), or the device. Suggest testing next to the router or on a cable, and restarting the router. If it stays low on a cable, escalate — the router may need replacing.
- NEVER say a result is "above your plan", "normal for your plan" or "matches your plan". Plan speed applies to internet traffic, not to this test.
- Low speed on websites/games but a high result here = internet-side congestion or the plan limit/FUP — use the report's fupActive and bandwidth fields, and escalate if those are clean.`;

const SALES_BULLET =
	'- A subscriber\'s own plan and price come ONLY from the "plan" field of isp-diagnose-customer / isp-search-customer or the VERIFIED CUSTOMER section — never from the SERVICE PLANS list. Many subscribers are on older plans that are no longer sold; a similar name (e.g. "UP TO 6M" vs "UP TO 6M NEW") is a different plan with a different price.';

const BOUNDARIES_BULLET =
	"- Speed-test screenshots from speedtest.libancomlb.com measure the line up to our network, not the plan — never compare them to the plan speed (see Speed Test).";

interface PromptEdit {
	name: string;
	apply: (prompt: string) => string | "already" | "no-anchor";
}

/** Replace the block that starts at `heading` and runs to the next top-level heading. */
function replaceBlock(
	heading: RegExp,
	nextHeading: RegExp,
	build: (headingLine: string) => string,
): PromptEdit["apply"] {
	return (prompt) => {
		if (
			prompt.includes(
				"Reading the result — this test runs on a server INSIDE our network",
			)
		) {
			return "already";
		}
		const start = prompt.search(heading);
		if (start === -1) {
			return "no-anchor";
		}
		const afterHeading = prompt.indexOf("\n", start);
		const rest = prompt.slice(afterHeading);
		const nextOffset = rest.search(nextHeading);
		const end =
			nextOffset === -1 ? prompt.length : afterHeading + nextOffset;
		const headingLine = prompt.slice(start, afterHeading);
		return `${prompt.slice(0, start)}${build(headingLine)}${prompt.slice(end)}`;
	};
}

/** Insert `bullet` on the line after the first line that contains `anchor`. */
function insertAfterLine(anchor: string, bullet: string): PromptEdit["apply"] {
	return (prompt) => {
		if (prompt.includes(bullet)) {
			return "already";
		}
		const at = prompt.indexOf(anchor);
		if (at === -1) {
			return "no-anchor";
		}
		const lineEnd = prompt.indexOf("\n", at);
		const cut = lineEnd === -1 ? prompt.length : lineEnd;
		return `${prompt.slice(0, cut)}\n${bullet}${prompt.slice(cut)}`;
	};
}

const EDITS: Record<string, PromptEdit[]> = {
	[LIBANCOM_AGENT_ID]: [
		{
			name: "Speed Test block",
			apply: replaceBlock(
				/^## Speed Test[^\n]*$/m,
				/\n## /,
				(heading) => `${heading}\n\n${SPEED_TEST_BODY}\n`,
			),
		},
		{
			name: "Sales: own plan comes from the plan field",
			apply: insertAfterLine(
				"- Present available plans from the SERVICE PLANS data",
				SALES_BULLET,
			),
		},
		{
			name: "Boundaries: speed test is not the plan",
			apply: insertAfterLine(
				"- Every claim about a customer's account must come from a tool result",
				BOUNDARIES_BULLET,
			),
		},
	],
	[DOTNET_AGENT_ID]: [
		{
			name: "SPEED TEST block",
			apply: replaceBlock(
				/^SPEED TEST:[^\n]*$/m,
				/\n\n[A-Z][A-Z /&()-]+:/,
				(heading) => `${heading}\n${SPEED_TEST_BODY}`,
			),
		},
		{
			name: "Sales: own plan comes from the plan field",
			apply: insertAfterLine(
				"present the available plans from your SERVICE PLANS data",
				SALES_BULLET,
			),
		},
		{
			name: "Boundaries: speed test is not the plan",
			apply: insertAfterLine(
				"Every claim about a customer's account must come from a tool result",
				BOUNDARIES_BULLET,
			),
		},
	],
};

function changedRegion(before: string, after: string): string {
	let start = 0;
	while (start < before.length && before[start] === after[start]) {
		start++;
	}
	let endBefore = before.length;
	let endAfter = after.length;
	while (
		endBefore > start &&
		endAfter > start &&
		before[endBefore - 1] === after[endAfter - 1]
	) {
		endBefore--;
		endAfter--;
	}
	const lineStart = before.lastIndexOf("\n", start - 1) + 1;
	const lineEnd = (text: string, from: number) => {
		const at = text.indexOf("\n", from);
		return at === -1 ? text.length : at;
	};
	return [
		"--- before",
		before.slice(lineStart, lineEnd(before, endBefore)),
		"+++ after",
		after.slice(lineStart, lineEnd(after, endAfter)),
	].join("\n");
}

async function main(): Promise<void> {
	const apply = process.argv.includes("--apply");
	const agentIds = [LIBANCOM_AGENT_ID];
	if (process.argv.includes("--include-dotnet")) {
		agentIds.push(DOTNET_AGENT_ID);
	}
	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		logError("DATABASE_URL is not set");
		process.exit(1);
	}

	const client = new pg.Client({ connectionString: databaseUrl });
	await client.connect();
	try {
		for (const agentId of agentIds) {
			const res = await client.query(
				'SELECT id, name, "systemPrompt" FROM ai_agent WHERE id = $1',
				[agentId],
			);
			const row = res.rows[0] as
				| { id: string; name: string; systemPrompt: string }
				| undefined;
			if (!row) {
				logError(`Agent ${agentId} not found — skipped`);
				continue;
			}
			log(`\n=== ${row.name} (${row.id}) ===`);

			let prompt = row.systemPrompt;
			let changes = 0;
			for (const edit of EDITS[agentId] ?? []) {
				const next = edit.apply(prompt);
				if (next === "already") {
					log(`- ${edit.name}: already applied`);
					continue;
				}
				if (next === "no-anchor") {
					logError(
						`- ${edit.name}: anchor not found — SKIPPED, edit by hand`,
					);
					continue;
				}
				log(
					`- ${edit.name}: will change\n${changedRegion(prompt, next)}\n`,
				);
				prompt = next;
				changes++;
			}

			if (changes === 0) {
				log("Nothing to change.");
				continue;
			}
			if (!apply) {
				log(
					`Dry run: ${changes} edit(s) not written. Re-run with --apply.`,
				);
				continue;
			}
			await client.query(
				'UPDATE ai_agent SET "systemPrompt" = $1, "updatedAt" = now() WHERE id = $2 AND "systemPrompt" = $3',
				[prompt, agentId, row.systemPrompt],
			);
			log(`Applied ${changes} edit(s).`);
		}
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	logError(error);
	process.exit(1);
});
